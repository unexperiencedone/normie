import asyncio 

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from langgraph.graph import END, START, StateGraph

from backend.llm.client import get_nemotron
from .state import DesignState, Phase, make_initial_state

class ClarificationOutput(BaseModel):
    questions: list[str] = Field(min_length=2, max_length=4)


CLARIFICATION_PROMPT = """
You are the clarification stage of a relational database-design workflow.

Read the user's reuirements and asl between 2 and 4 questions whose answers
would materially change the ER diagram, entities, relationships, constraints,
or project scope.

Do not create an ER diagram.
Do not create tables or SQL.
Do not give explanations, headings, or Markdown.

Return only valid JSON in this exact format:

{
    "questions":[
        "Question one?",
        "Questions two?",
        "Question three?",
        "Question four?"
    ]
}
"""


def build_design_workflow(llm):
    async def create_clarification_questions(
        state: DesignState
    ) -> dict:
        response  = await llm.ainvoke(
            [
                SystemMessage(content = CLARIFICATION_PROMPT),
                HumanMessage(content=state["requirements_text"]),
            ]
        )

        parsed = ClarificationOutput.model_validate_json(
            response.content
        )

        return {
            "phase": Phase.CLARIFYING.value,
            "questions": parsed.questions,
        }

    graph = StateGraph(DesignState)

    graph.add_node(
        "create_clarification_questions",
        create_clarification_questions,
    )
    graph.add_edge(START, "create_clarification_questions")
    graph.add_edge("create_clarification_questions", END)

    return graph.compile()

async def main():
    initial_state = make_initial_state(
        tenant_id = "demo-organization",
        project_id="college-database",
        workflow_run_id="run-001",
        requirements_text=(
            "Build a database for college course registration."
            "Students select courses each semester."
            ),
    )

    workflow = build_design_workflow(get_nemotron())
    result = await workflow.ainvoke(initial_state)

    print("Current phase:", result["phase"])
    print("\nNemotron questions:")
    for question in result["questions"]:
        print("-", question)


if __name__ == "__main__":
    asyncio.run(main())
        