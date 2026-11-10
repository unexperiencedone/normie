"""Integration tests against a real PostgreSQL cluster (the one in DATABASE_URL / PG_*).

Each test module provisions a throwaway project database and drops it at the end.
"""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from backend.core import db
from backend.core.security import hash_password
from backend.services import approvals, backups, executor, security
from backend.services.executor import Actor, ExecError
from backend.services.sqlpolicy import PolicyError
from backend.tenancy.provision import delete_project, provision_project

pytestmark = pytest.mark.asyncio(loop_scope="module")

SCHEMA = """
CREATE TABLE doctor (doctor_id serial PRIMARY KEY, name text NOT NULL, specialty text);
CREATE TABLE patient (patient_id serial PRIMARY KEY, name text NOT NULL, diagnosis text);
CREATE TABLE appointment (
  appointment_id serial PRIMARY KEY,
  patient_id int NOT NULL REFERENCES patient ON DELETE CASCADE,
  doctor_id int NOT NULL REFERENCES doctor,
  starts_at timestamptz NOT NULL
);
"""


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def ctx():
    await db.init_control_plane()
    uid = await db.control().fetchval(
        "INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING user_id",
        f"it-{uuid.uuid4().hex[:8]}@test.local", hash_password("pw"))
    pid = await provision_project(uid, f"it-{uuid.uuid4().hex[:6]}", "integration")
    yield {"pid": pid, "uid": uid, "actor": Actor(uid, "user")}
    await delete_project(pid)
    await db.close_all()


async def test_migration_requires_approval_and_applies(ctx):
    r = await approvals.request_sql(ctx["pid"], SCHEMA, "clinic schema", ctx["actor"])
    assert r["status"] == "pending_approval"
    a = r["approval"]
    assert a["kind"] == "migration" and a["risk"] == "medium"
    assert set(a["preview"]["diff"]["tables_added"]) == {"doctor", "patient", "appointment"}
    # dry run must not have persisted anything
    assert (await executor.schema(ctx["pid"]))["tables"] == []
    done = await approvals.decide(ctx["pid"], uuid.UUID(a["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved", done
    names = {t["name"] for t in (await executor.schema(ctx["pid"]))["tables"]}
    assert names == {"doctor", "patient", "appointment"}


async def test_low_risk_insert_autocommits_and_read(ctx):
    r = await approvals.request_sql(
        ctx["pid"], "INSERT INTO doctor (name, specialty) VALUES ('Rao','cardio'),('Iyer','neuro'),('Das','cardio')",
        "seed doctors", ctx["actor"])
    assert r["status"] == "executed" and r["result"]["rows_affected"] == 3
    await approvals.request_sql(ctx["pid"], "INSERT INTO patient (name, diagnosis) VALUES ('Asha','flu'),('Ravi','asthma')",
                                "seed patients", ctx["actor"])
    out = await executor.run_read(ctx["pid"], "SELECT name FROM doctor ORDER BY name", ctx["actor"])
    assert [r[0] for r in out["rows"]] == ["Das", "Iyer", "Rao"]
    assert out["columns"][0]["name"] == "name"


async def test_reads_are_really_read_only(ctx):
    with pytest.raises(ExecError):
        await executor.run_read(ctx["pid"], "DELETE FROM doctor WHERE doctor_id = 1", ctx["actor"])
    with pytest.raises((ExecError, PolicyError)):
        await executor.run_read(ctx["pid"], "SELECT 1; DROP TABLE doctor", ctx["actor"])
    with pytest.raises(ExecError):  # data-modifying CTE
        await executor.run_read(ctx["pid"], "WITH x AS (DELETE FROM doctor RETURNING *) SELECT * FROM x", ctx["actor"])
    with pytest.raises((ExecError, PolicyError)):
        await executor.run_read(ctx["pid"], "SELECT * FROM pg_catalog.pg_authid", ctx["actor"])


async def test_multi_row_update_needs_approval_then_undo(ctx):
    r = await approvals.request_sql(ctx["pid"], "UPDATE doctor SET specialty='cardiology' WHERE specialty='cardio'",
                                    "rename specialty", ctx["actor"])
    assert r["status"] == "pending_approval"
    a = r["approval"]
    assert a["risk"] == "medium" and a["preview"]["rows_affected"] == 2
    assert len(a["preview"]["before"]) == 2
    done = await approvals.decide(ctx["pid"], uuid.UUID(a["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved"
    audit_id = done["result"]["audit_id"]
    cnt = await executor.run_read(ctx["pid"], "SELECT count(*) FROM doctor WHERE specialty='cardiology'", ctx["actor"])
    assert cnt["rows"][0][0] == 2

    u = await approvals.request_undo(ctx["pid"], audit_id, ctx["actor"])
    assert u["approval"]["preview"]["rows_affected"] == 2
    await approvals.decide(ctx["pid"], uuid.UUID(u["approval"]["approval_id"]), ctx["uid"], True)
    cnt = await executor.run_read(ctx["pid"], "SELECT count(*) FROM doctor WHERE specialty='cardio'", ctx["actor"])
    assert cnt["rows"][0][0] == 2


async def test_delete_without_where_is_high_risk_and_undo_restores(ctx):
    r = await approvals.request_sql(ctx["pid"], "DELETE FROM patient", "wipe patients", ctx["actor"])
    a = r["approval"]
    assert a["risk"] == "high"
    done = await approvals.decide(ctx["pid"], uuid.UUID(a["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved"
    u = await approvals.request_undo(ctx["pid"], done["result"]["audit_id"], ctx["actor"])
    await approvals.decide(ctx["pid"], uuid.UUID(u["approval"]["approval_id"]), ctx["uid"], True)
    out = await executor.run_read(ctx["pid"], "SELECT name FROM patient ORDER BY name", ctx["actor"])
    assert [r[0] for r in out["rows"]] == ["Asha", "Ravi"]


async def test_rejected_approval_does_nothing(ctx):
    r = await approvals.request_sql(ctx["pid"], "DROP TABLE appointment", "drop", ctx["actor"])
    assert r["approval"]["risk"] == "high"
    await approvals.decide(ctx["pid"], uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], False)
    names = {t["name"] for t in (await executor.schema(ctx["pid"]))["tables"]}
    assert "appointment" in names


async def test_business_role_enforced_by_postgres(ctx):
    spec = security.RoleSpec(name="receptionist", description="no diagnoses", grants=[
        security.TableGrant(table="patient", privileges=["SELECT"], columns=["patient_id", "name"]),
        security.TableGrant(table="doctor", privileges=["SELECT"]),
    ])
    r = await approvals.request_role(ctx["pid"], spec, ctx["actor"])
    done = await approvals.decide(ctx["pid"], uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved", done
    role = await security.get_db_role(ctx["pid"], "receptionist")
    ok = await executor.simulate_access(ctx["pid"], role, "SELECT name FROM patient")
    assert ok["allowed"], ok
    denied = await executor.simulate_access(ctx["pid"], role, "SELECT diagnosis FROM patient")
    assert not denied["allowed"] and denied["layer"] == "postgres"
    denied_w = await executor.simulate_access(ctx["pid"], role, "DELETE FROM doctor WHERE doctor_id=1")
    assert not denied_w["allowed"]
    view = await executor.simulate_access(ctx["pid"], role, "SELECT * FROM patient_for_receptionist")
    assert view["allowed"], view


async def test_row_level_security_filter(ctx):
    # NB: dry runs consume sequence values (sequences are non-transactional), so look the id up.
    rao = (await executor.run_read(ctx["pid"], "SELECT doctor_id FROM doctor WHERE name='Rao'", ctx["actor"]))["rows"][0][0]
    spec = security.RoleSpec(name="dr_rao", description="only own appointments", grants=[
        security.TableGrant(table="appointment", privileges=["SELECT"], row_filter=f"doctor_id = {rao}"),
    ])
    r = await approvals.request_role(ctx["pid"], spec, ctx["actor"])
    await approvals.decide(ctx["pid"], uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    seeded = await approvals.request_sql(ctx["pid"], """INSERT INTO appointment (patient_id, doctor_id, starts_at)
        SELECT p.patient_id, d.doctor_id, now() FROM patient p CROSS JOIN doctor d""", "seed", ctx["actor"])
    assert seeded["status"] == "executed", seeded
    role = await security.get_db_role(ctx["pid"], "dr_rao")
    res = await executor.simulate_access(ctx["pid"], role, "SELECT doctor_id FROM appointment")
    assert res["allowed"] and res["sample"] and all(r["doctor_id"] == rao for r in res["sample"])
    # base ro role still sees everything
    all_rows = await executor.run_read(ctx["pid"], "SELECT count(DISTINCT doctor_id) FROM appointment", ctx["actor"])
    assert all_rows["rows"][0][0] == 3


async def test_explain_and_index_benchmark(ctx):
    r = await approvals.request_sql(ctx["pid"], """
        CREATE TABLE event (id bigserial PRIMARY KEY, kind int NOT NULL, payload text);
        INSERT INTO event (kind, payload) SELECT g % 1000, md5(g::text) FROM generate_series(1, 60000) g;""",
        "events table", ctx["actor"])
    await approvals.decide(ctx["pid"], uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    plan = await executor.explain(ctx["pid"], "SELECT * FROM event WHERE kind = 42", analyze=True)
    assert "Seq Scan" in plan["text"]
    bench = await executor.benchmark_index(ctx["pid"], "SELECT * FROM event WHERE kind = 42",
                                           "CREATE INDEX event_kind_idx ON event (kind)")
    assert bench["after_ms"] < bench["before_ms"]
    assert "event_kind_idx" in bench["after_plan"]
    # benchmark is a what-if: the index must not exist afterwards
    idx = {i["name"] for t in (await executor.schema(ctx["pid"]))["tables"] for i in t["indexes"]}
    assert "event_kind_idx" not in idx


async def test_backup_and_restore(ctx):
    b = await backups.create_backup(ctx["pid"], "manual", ctx["uid"])
    assert b["size_bytes"] > 0
    r = await approvals.request_sql(ctx["pid"], "DROP TABLE event", "drop events", ctx["actor"])
    await approvals.decide(ctx["pid"], uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    assert "event" not in {t["name"] for t in (await executor.schema(ctx["pid"]))["tables"]}
    rr = await approvals.request_restore(ctx["pid"], uuid.UUID(b["backup_id"]), ctx["actor"])
    done = await approvals.decide(ctx["pid"], uuid.UUID(rr["approval"]["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved", done
    assert "event" in {t["name"] for t in (await executor.schema(ctx["pid"]))["tables"]}


async def test_audit_log_is_append_only(ctx):
    import asyncpg
    with pytest.raises(asyncpg.PostgresError):
        await db.control().execute("DELETE FROM audit_log WHERE project_id=$1", ctx["pid"])
    with pytest.raises(asyncpg.PostgresError):
        await db.control().execute("UPDATE audit_log SET sql_text='x' WHERE project_id=$1", ctx["pid"])


async def test_dry_runs_do_not_consume_sequence_values(ctx):
    """Regression: a dry run must leave serial/identity sequences exactly where they were, so a
    script that hardcodes ids (INSERT child rows referencing parent_id = 1..n) still works."""
    pid, actor = ctx["pid"], ctx["actor"]
    r = await approvals.request_sql(pid, "CREATE TABLE seqtest (id serial PRIMARY KEY, v text);"
                                         "CREATE TABLE seqchild (id serial PRIMARY KEY, parent int REFERENCES seqtest);",
                                    "seq tables", actor)
    await approvals.decide(pid, uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    batch = ("INSERT INTO seqtest (v) VALUES ('a'),('b'),('c');"
             "INSERT INTO seqchild (parent) VALUES (1),(2),(3);")
    r = await approvals.request_sql(pid, batch, "seed with hardcoded ids", actor)
    a = r["approval"]
    assert a["preview"]["data_only"] and a["preview"]["rows_affected"] == 6
    done = await approvals.decide(pid, uuid.UUID(a["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved", done["result"]
    ids = await executor.run_read(pid, "SELECT id FROM seqtest ORDER BY id", actor)
    assert [x[0] for x in ids["rows"]] == [1, 2, 3]
    # single-statement write path too
    await approvals.request_sql(pid, "INSERT INTO seqtest (v) VALUES ('d')", "one more", actor)
    ids = await executor.run_read(pid, "SELECT max(id) FROM seqtest", actor)
    assert ids["rows"][0][0] == 4


async def test_cascading_delete_is_reported_and_not_falsely_reversible(ctx):
    pid, actor = ctx["pid"], ctx["actor"]
    r = await approvals.request_sql(pid, "CREATE TABLE parent_c (id serial PRIMARY KEY);"
                                         "CREATE TABLE child_c (id serial PRIMARY KEY, p int REFERENCES parent_c ON DELETE CASCADE);",
                                    "cascade tables", actor)
    await approvals.decide(pid, uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    r = await approvals.request_sql(pid, "INSERT INTO parent_c DEFAULT VALUES;"
                                         "INSERT INTO child_c (p) SELECT id FROM parent_c CROSS JOIN generate_series(1,3);",
                                    "seed", actor)
    await approvals.decide(pid, uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    pv = await executor.dry_run_write(pid, "DELETE FROM parent_c WHERE id = 1")
    assert pv["rows_affected"] == 1
    assert pv["cascaded"] == {"child_c": 3}
    assert pv["reversible"] is False
    assert pv["risk"] == "medium"  # 1 row on its own would be low; the cascade makes it 4
    assert any("CASCADE" in n for n in pv["notes"])


async def test_normalization_connected_to_real_table(ctx):
    from backend.services import normalization
    pid, actor = ctx["pid"], ctx["actor"]
    r = await approvals.request_sql(pid, """
        CREATE TABLE enrollment_flat (student_id int, course_id int, student_name text NOT NULL,
          course_title text NOT NULL, grade int, PRIMARY KEY (student_id, course_id));
        INSERT INTO enrollment_flat VALUES
          (1, 10, 'Asha', 'Databases', 91), (1, 11, 'Asha', 'Networks', 78),
          (2, 10, 'Ravi', 'Databases', 85), (2, 12, 'Ravi', 'Compilers', 70),
          (3, 11, 'Meera', 'Networks', 88), (3, 12, 'Meera', 'Compilers', 91);""", "flat table", actor)
    await approvals.decide(pid, uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    t = await normalization.table_info(pid, "enrollment_flat")
    declared = normalization.declared_fds(t)
    assert declared == [{"lhs": ["student_id", "course_id"], "rhs": ["student_name", "course_title", "grade"],
                         "source": "key", "label": "primary key"}]
    obs = await normalization.discover_fds(pid, t)
    found = {(tuple(f["lhs"]), tuple(f["rhs"])) for f in obs["fds"]}
    assert (("student_id",), ("student_name",)) in found
    assert (("course_id",), ("course_title",)) in found
    # name <-> id are 1:1 in this data, so the reverse FDs are observed too: that is exactly why
    # observed FDs are hypotheses the designer confirms
    assert (("student_name",), ("student_id",)) in found

    health = {h["table"]: h for h in await normalization.schema_health(pid)}
    assert health["enrollment_flat"]["nf_declared"] == "BCNF"   # the key alone looks perfect
    # With EVERY observed FD (incl. the coincidental name -> id), names become prime attributes,
    # so the partial dependencies are allowed by 3NF but still violate BCNF.
    assert health["enrollment_flat"]["nf_observed"] == "3NF"

    # The designer confirms only the meaningful FDs: then the partial dependencies break 2NF.
    attrs = [c["name"] for c in t["columns"]]
    fds = declared + [{"lhs": ["student_id"], "rhs": ["student_name"]}, {"lhs": ["course_id"], "rhs": ["course_title"]}]
    assert normalization.analyze(attrs, fds)["report"]["highest_nf"] == "1NF"
    res = normalization.analyze(attrs, fds)
    parts = res["bcnf"]["relations"]
    assert res["bcnf"]["lossless"] and len(parts) == 3
    up, down, plan = normalization.decomposition_sql("enrollment_flat", fds, parts)
    r = await approvals.request_sql(pid, up, "decompose", actor, down_sql=down)
    assert r["approval"]["kind"] == "migration"
    done = await approvals.decide(pid, uuid.UUID(r["approval"]["approval_id"]), ctx["uid"], True)
    assert done["status"] == "approved", done["result"]
    counts = {}
    for p in plan:
        res_ = await executor.run_read(pid, f'SELECT count(*) FROM "{p["table"]}"', actor)
        counts[tuple(p["key"])] = res_["rows"][0][0]
    assert counts[("student_id",)] == 3 and counts[("course_id",)] == 3
    assert counts[("course_id", "student_id")] == 6
