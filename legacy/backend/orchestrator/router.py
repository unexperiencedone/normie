from __future__ import annotations
from typing import Any
from backend.agents.design import DesignAgent
from backend.agents.evolution import EvolutionAgent
from backend.agents.query import QueryAgent
from backend.agents.recovery import RecoveryAgent
from backend.agents.schema import SchemaAgent
from backend.agents.security import SecurityAgent
from backend.agents.transaction import TransactionAgent
from backend.agents.tuning import TuningAgent
from backend.llm.base import LLM
from backend.orchestrator.state import ProjectState, ToolResult


class Orchestrator:
    """Central Orchestrator: classifies intent, routes to specialist agents,
    manages ProjectState transitions, and aggregates responses."""

    def __init__(self, llm: LLM):
        self.llm = llm
        self.design_agent = DesignAgent(llm)
        self.schema_agent = SchemaAgent(llm)
        self.security_agent = SecurityAgent(llm)
        self.query_agent = QueryAgent(llm)
        self.transaction_agent = TransactionAgent()
        self.tuning_agent = TuningAgent()
        self.evolution_agent = EvolutionAgent(llm)
        self.recovery_agent = RecoveryAgent()

    def classify_intent(self, user_message: str) -> str:
        """Classify user intent based on request routing table."""
        msg = user_message.lower()
        if any(w in msg for w in ["also need", "also track", "evolve", "add column", "new requirement"]):
            return "evolution"
        if any(w in msg for w in ["database for", "design", "entities", "build a database", "build a db"]):
            return "design"
        if any(w in msg for w in ["slow", "tuning", "index", "performance", "explain"]):
            return "tuning"
        if any(w in msg for w in ["undo", "restore", "backup", "rollback"]):
            return "recovery"
        if any(w in msg for w in ["role", "grant", "permission", "access", "receptionist", "doctor"]):
            return "security"
        if any(w in msg for w in ["insert", "update", "delete", "book ", "increment"]):
            return "transaction"
        if any(w in msg for w in ["track "]):
            return "design"
        # Default to query
        return "query"

    async def dispatch(
        self,
        state: ProjectState,
        user_message: str,
        role_name: str | None = None,
        extra_args: dict[str, Any] | None = None,
    ) -> tuple[ProjectState, ToolResult]:
        """Dispatch user message to appropriate specialist agent."""
        intent = self.classify_intent(user_message)
        extra = extra_args or {}

        if intent == "design":
            return await self.design_agent.run(state, user_input=user_message)

        if intent == "query":
            return await self.query_agent.run(state, question=user_message, role_name=role_name)

        if intent == "transaction":
            sql = extra.get("sql", user_message)
            return await self.transaction_agent.execute_or_request_approval(state, sql=sql)

        if intent == "security":
            return await self.security_agent.run(state, role_description=user_message)

        if intent == "tuning":
            res = await self.tuning_agent.analyze(state)
            return state, res

        if intent == "evolution":
            return await self.evolution_agent.evolve(state, new_requirement=user_message)

        if intent == "recovery":
            audit_id = extra.get("audit_id", "sample_audit_id")
            res = await self.recovery_agent.undo(state, audit_id=audit_id)
            return state, res

        # Fallback to query
        return await self.query_agent.run(state, question=user_message, role_name=role_name)
