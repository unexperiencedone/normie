import pytest
from backend.llm.mock import MockAdapter
from backend.orchestrator.router import Orchestrator
from backend.orchestrator.state import ProjectState


@pytest.mark.asyncio
async def test_orchestrator_intent_classification():
    orch = Orchestrator(MockAdapter())
    assert orch.classify_intent("I need a database for a hospital clinic") == "design"
    assert orch.classify_intent("Which students scored above 80 in Databases?") == "query"
    assert orch.classify_intent("Why is this slow? Show query index recommendations") == "tuning"
    assert orch.classify_intent("We now also need to track prescriptions") == "evolution"
    assert orch.classify_intent("Undo last action from audit log") == "recovery"
    assert orch.classify_intent("Configure receptionist role permissions") == "security"


@pytest.mark.asyncio
async def test_design_agent_flow():
    orch = Orchestrator(MockAdapter())
    state = ProjectState(requirements_text="I run a clinic with patients and doctors")
    new_state, res = await orch.dispatch(state, "I need a database for a clinic with patients and doctors")
    assert res.ok is True
    assert "er_model" in res.data
    assert "mermaid" in res.data
    assert "erDiagram" in res.data["mermaid"]
    assert new_state.stage == "design"


@pytest.mark.asyncio
async def test_schema_agent_flow():
    orch = Orchestrator(MockAdapter())
    state = ProjectState()
    # First get ER model
    state, res_d = await orch.design_agent.run(state, "clinic with patients and doctors")
    assert res_d.ok is True

    # Run Schema Agent
    state, res_s = await orch.schema_agent.run(state)
    assert res_s.ok is True
    assert "ddl" in res_s.data
    assert "CREATE TABLE" in res_s.data["ddl"]
    assert "normal_form_reports" in res_s.data


@pytest.mark.asyncio
async def test_security_agent_flow():
    orch = Orchestrator(MockAdapter())
    state = ProjectState()
    state, _ = await orch.design_agent.run(state, "clinic with patients")
    state, _ = await orch.schema_agent.run(state)

    state, res = await orch.security_agent.run(state, "receptionist can view patient appointments but no billing")
    assert res.ok is True
    assert "role" in res.data
    assert res.data["simulation"]["allowed"] is True


@pytest.mark.asyncio
async def test_query_agent_flow():
    orch = Orchestrator(MockAdapter())
    state = ProjectState()
    state, _ = await orch.design_agent.run(state, "student courses and grades")
    state, _ = await orch.schema_agent.run(state)

    state, res = await orch.query_agent.run(state, "Which students scored above 80 in Databases?")
    assert res.ok is True
    assert "sql" in res.data
    assert "algebra" in res.data
    assert "π" in res.data["algebra"] or "pi" in res.data["algebra"].lower()
    assert "plan" in res.data


@pytest.mark.asyncio
async def test_transaction_agent_risk():
    orch = Orchestrator(MockAdapter())
    state = ProjectState()

    # Low risk
    state, res_low = await orch.transaction_agent.execute_or_request_approval(
        state, "INSERT INTO patient (name) VALUES ('John');"
    )
    assert res_low.ok is True
    assert res_low.data["status"] == "committed"

    # High risk - DROP TABLE requires approval
    state, res_high = await orch.transaction_agent.execute_or_request_approval(
        state, "DROP TABLE patient CASCADE;"
    )
    assert res_high.ok is True
    assert res_high.data["status"] == "needs_approval"
    assert len(state.pending_approvals) >= 1
