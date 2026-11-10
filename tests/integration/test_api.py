"""HTTP-level tests of the FastAPI app (in-process, real PostgreSQL)."""
from __future__ import annotations

import uuid

import httpx
import pytest
import pytest_asyncio

from backend.main import app
from backend.core import db

pytestmark = pytest.mark.asyncio(loop_scope="module")
H = {"X-Normie-Client": "web"}


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client():
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1", headers=H) as c:
            email = f"api-{uuid.uuid4().hex[:8]}@test.local"
            r = await c.post("/auth/register", json={"email": email, "password": "correct-horse-1"})
            assert r.status_code == 200, r.text
            r = await c.post("/projects", json={"name": f"api {uuid.uuid4().hex[:6]}", "description": "t"})
            assert r.status_code == 200, r.text
            c.pid = r.json()["project_id"]
            yield c
            p = await c.get(f"/projects/{c.pid}")
            await c.request("DELETE", f"/projects/{c.pid}", json={"confirm_name": p.json()["name"]})


async def test_csrf_header_required(client):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1") as raw:
        r = await raw.post("/auth/login", json={"email": "x@y.zz", "password": "whatever1"})
        assert r.status_code == 403


async def test_requires_auth(client):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1", headers=H) as anon:
        assert (await anon.get("/projects")).status_code == 401


async def test_ddl_approval_flow_and_rows(client):
    pid = client.pid
    r = await client.post(f"/projects/{pid}/sql/run", json={
        "sql": "CREATE TABLE item (item_id serial PRIMARY KEY, name text NOT NULL, price numeric(10,2));"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["kind"] == "approval" and body["approval"]["preview"]["diff"]["tables_added"] == ["item"]
    aid = body["approval"]["approval_id"]
    r = await client.post(f"/projects/{pid}/approvals/{aid}/decision", json={"approve": True})
    assert r.json()["status"] == "approved", r.text
    # double-approve is rejected
    r = await client.post(f"/projects/{pid}/approvals/{aid}/decision", json={"approve": True})
    assert r.status_code == 400

    r = await client.post(f"/projects/{pid}/tables/item/insert", json={"values": {"name": "O'Reilly book", "price": "19.99"}})
    assert r.json()["status"] == "executed", r.text
    r = await client.get(f"/projects/{pid}/tables/item/rows")
    d = r.json()
    assert d["total"] == 1 and d["rows"][0][1] == "O'Reilly book" and d["rows"][0][2] == "19.99"

    item_id = d["rows"][0][0]
    r = await client.post(f"/projects/{pid}/tables/item/update", json={"pk": {"item_id": item_id}, "values": {"price": "5"}})
    assert r.json()["status"] == "executed"
    r = await client.post(f"/projects/{pid}/sql/run", json={"sql": "SELECT name, price FROM item WHERE price > 1"})
    d = r.json()
    assert d["kind"] == "rows" and d["rows"] == [["O'Reilly book", 5]]
    assert "σ" in d["algebra"] and "π" in d["algebra"]


async def test_policy_blocks(client):
    pid = client.pid
    for bad in ["SELECT pg_sleep(10)", "SELECT * FROM pg_authid", "COPY item TO PROGRAM 'id'",
                "CREATE ROLE evil", "SELECT 1; SELECT 2", "GRANT ALL ON item TO PUBLIC"]:
        r = await client.post(f"/projects/{pid}/sql/run", json={"sql": bad})
        assert r.status_code in (400, 422), (bad, r.status_code, r.text)


async def test_sql_injection_through_table_editor_is_inert(client):
    pid = client.pid
    evil = "x'); DROP TABLE item; --"
    r = await client.post(f"/projects/{pid}/tables/item/insert", json={"values": {"name": evil}})
    assert r.json()["status"] == "executed"
    r = await client.post(f"/projects/{pid}/sql/run", json={"sql": "SELECT count(*) FROM item WHERE name = 'x''); DROP TABLE item; --'"})
    assert r.json()["rows"] == [[1]]


async def test_connection_secrets(client):
    pid = client.pid
    c = (await client.get(f"/projects/{pid}/connection")).json()
    assert {r["kind"] for r in c["roles"]} == {"owner", "rw", "ro"}
    assert "password" not in str(c).lower() or all("password" not in r for r in c["roles"])
    pw1 = (await client.post(f"/projects/{pid}/connection/reveal", json={"kind": "ro"})).json()["password"]
    assert len(pw1) >= 32
    await client.post(f"/projects/{pid}/connection/rotate", json={"kind": "ro"})
    pw2 = (await client.post(f"/projects/{pid}/connection/reveal", json={"kind": "ro"})).json()["password"]
    assert pw1 != pw2
    # reads still work after rotation (pools were refreshed)
    r = await client.post(f"/projects/{pid}/sql/run", json={"sql": "SELECT 1 AS one"})
    assert r.json()["rows"] == [[1]]


async def test_other_user_cannot_access_project(client):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test/api/v1", headers=H) as other:
        await other.post("/auth/register", json={"email": f"intruder-{uuid.uuid4().hex[:6]}@test.local",
                                                 "password": "correct-horse-2"})
        assert (await other.get(f"/projects/{client.pid}")).status_code == 404
        assert (await other.post(f"/projects/{client.pid}/sql/run", json={"sql": "SELECT 1"})).status_code == 404
        assert (await other.post(f"/projects/{client.pid}/connection/reveal", json={"kind": "owner"})).status_code == 404


async def test_normalization_tool(client):
    r = await client.post("/tools/normalize", json={
        "attributes": ["student_id", "course_id", "student_name", "course_title", "grade"],
        "fds": [{"lhs": ["student_id"], "rhs": ["student_name"]},
                {"lhs": ["course_id"], "rhs": ["course_title"]},
                {"lhs": ["student_id", "course_id"], "rhs": ["grade"]}]})
    d = r.json()
    assert d["candidate_keys"] == [["course_id", "student_id"]]
    assert d["report"]["highest_nf"] == "1NF"
    assert d["bcnf"]["lossless"] and d["3nf"]["dependency_preserving"]
