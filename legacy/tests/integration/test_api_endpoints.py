import pytest
import pytest_asyncio
import httpx
from backend.api.app import app


@pytest_asyncio.fixture
async def async_client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_health_endpoints(async_client):
    res1 = await async_client.get("/healthz")
    assert res1.status_code == 200
    assert res1.json()["status"] == "ok"

    res2 = await async_client.get("/readyz")
    assert res2.status_code == 200
    assert res2.json()["status"] == "ready"


@pytest.mark.asyncio
async def test_auth_flow(async_client):
    email = "engineer@dbforge.io"
    res_reg = await async_client.post("/api/v1/auth/register", json={"email": email, "password": "securepassword123"})
    assert res_reg.status_code == 200
    assert res_reg.json()["ok"] is True
    assert "access_token" in res_reg.json()["data"]

    res_log = await async_client.post("/api/v1/auth/login", json={"email": email, "password": "securepassword123"})
    assert res_log.status_code == 200
    assert res_log.json()["ok"] is True
    assert "access_token" in res_log.json()["data"]


@pytest.mark.asyncio
async def test_tools_endpoints(async_client):
    payload = {
        "attrs": ["A", "B", "C", "D"],
        "fds": [
            {"lhs": ["A"], "rhs": ["B"]},
            {"lhs": ["B"], "rhs": ["C"]},
            {"lhs": ["C"], "rhs": ["D"]},
        ],
    }

    # Closure
    res_c = await async_client.post("/api/v1/tools/closure", json=payload)
    assert res_c.status_code == 200
    data_c = res_c.json()["data"]
    assert "closure" in data_c
    assert "D" in data_c["closure"]

    # Candidate keys
    res_k = await async_client.post("/api/v1/tools/candidate-keys", json=payload)
    assert res_k.status_code == 200
    assert [["A"]] == res_k.json()["data"]["candidate_keys"]

    # Normal form report
    res_nf = await async_client.post("/api/v1/tools/normal-form", json=payload)
    assert res_nf.status_code == 200
    assert res_nf.json()["data"]["highest_nf"] in ("2NF", "3NF", "BCNF", "1NF")

    # Decompose
    res_dec = await async_client.post("/api/v1/tools/decompose", json={**payload, "target": "3nf"})
    assert res_dec.status_code == 200
    assert len(res_dec.json()["data"]["parts"]) >= 1


@pytest.mark.asyncio
async def test_project_lifecycle_api(async_client):
    # Create Project
    res_p = await async_client.post(
        "/api/v1/projects",
        json={"name": "Clinic System", "requirements_text": "Clinic with patients and doctors"},
    )
    assert res_p.status_code == 200
    project_id = res_p.json()["data"]["project_id"]

    # Get Project
    res_get = await async_client.get(f"/api/v1/projects/{project_id}")
    assert res_get.status_code == 200
    assert res_get.json()["data"]["project_id"] == project_id

    # Query
    res_q = await async_client.post(
        f"/api/v1/projects/{project_id}/query",
        json={"question": "Show tomorrow's appointments for Dr. Rao"},
    )
    assert res_q.status_code == 200
    assert res_q.json()["ok"] is True
    assert "sql" in res_q.json()["data"]
    assert "algebra" in res_q.json()["data"]

    # Transaction Execution
    res_ex = await async_client.post(
        f"/api/v1/projects/{project_id}/execute",
        json={"sql": "INSERT INTO appointment VALUES(1);"},
    )
    assert res_ex.status_code == 200
    assert res_ex.json()["ok"] is True

    # High-Risk Transaction (needs approval)
    res_risk = await async_client.post(
        f"/api/v1/projects/{project_id}/execute",
        json={"sql": "DROP TABLE appointment CASCADE;"},
    )
    assert res_risk.status_code == 200
    assert res_risk.json()["data"]["status"] == "needs_approval"
    approval_id = res_risk.json()["data"]["approval_id"]

    # Approve decision
    res_dec = await async_client.post(
        f"/api/v1/approvals/{approval_id}/decision",
        json={"decision": "approved"},
    )
    assert res_dec.status_code == 200
    assert res_dec.json()["data"]["status"] == "approved"

    # Tuning
    res_tune = await async_client.post(f"/api/v1/projects/{project_id}/tune")
    assert res_tune.status_code == 200
    assert "recommendations" in res_tune.json()["data"]

    # Evolution
    res_evolve = await async_client.post(
        f"/api/v1/projects/{project_id}/evolve",
        json={"requirement": "We also need to track prescriptions"},
    )
    assert res_evolve.status_code == 200
    assert "migration_up" in res_evolve.json()["data"]
