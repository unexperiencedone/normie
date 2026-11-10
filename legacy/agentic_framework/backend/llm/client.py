import os
from dotenv import load_dotenv

from pathlib import Path
from langchain_nvidia_ai_endpoints import ChatNVIDIA

load_dotenv(Path(__file__).resolve().parents[2]/ ".env")

def get_nemotron() -> ChatNVIDIA:
    api_key = os.getenv("LLM_API_KEY")

    if not api_key:
        raise RuntimeError(
            "LLM_API_KEY is missing. Add it to the .env file"
        )
    
    return ChatNVIDIA(
        model=os.getenv(
            "LLM_MODEL",
            "nvidia/nemotron-3-ultra-550b-a55b"
        ),

        api_key=api_key,
        temperature=0.2,
        max_tokens=1000
    )

