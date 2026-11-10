import pytest
from backend.llm.mock import MockAdapter
from backend.orchestrator.state import ProjectState, ToolResult
from backend.db.models import Tenant, Project, Base
from backend.db.session import engine


@pytest.mark.asyncio
async def test_mock_adapter():
    adapter = MockAdapter()
    res = await adapter.complete([{"role": "user", "content": "I need a database for a clinic with patients and doctors"}])
    assert res.content != ""
    assert "Patient" in res.content
    assert "Doctor" in res.content


@pytest.mark.asyncio
async def test_project_state():
    state = ProjectState(requirements_text="Clinic database")
    assert state.stage == "design"
    assert state.er_model["entities"] == []
    tool_res = ToolResult(ok=True, data={"test": 123})
    assert tool_res.ok is True
    assert tool_res.data["test"] == 123


@pytest.mark.asyncio
async def test_db_models_init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    assert Tenant.__tablename__ == "tenants"
    assert Project.__tablename__ == "projects"
