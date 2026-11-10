from __future__ import annotations
import json
import os
from typing import Any
import httpx
from pydantic import BaseModel

from backend.llm.base import LLMResult, ToolCall
from backend.llm.mock import MockAdapter


class OpenAICompatibleLLM:
    """Universal LLM client for OpenAI-compatible endpoints:
    - NVIDIA Nemotron (NIM) via https://integrate.api.nvidia.com/v1
    - OpenAI (GPT-4o) via https://api.openai.com/v1
    - Ollama (Local) via http://localhost:11434/v1
    - OpenRouter / vLLM
    Falls back gracefully to MockAdapter if API key is missing or calls fail.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout_s: float = 30.0,
    ) -> None:
        self.api_key = api_key or os.getenv("LLM_API_KEY", "")
        self.base_url = (base_url or os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")).rstrip("/")
        self.model = model or os.getenv("LLM_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")
        self.timeout_s = timeout_s
        self.mock_fallback = MockAdapter()

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        schema: type[BaseModel] | dict[str, Any] | None = None,
    ) -> LLMResult:
        if not self.api_key:
            # Fall back gracefully to deterministic MockAdapter if no API key is configured
            return await self.mock_fallback.complete(messages, tools=tools, schema=schema)

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "top_p": 0.7,
            "max_tokens": 1024,
        }

        if schema:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                resp = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
                if resp.status_code != 200:
                    return await self.mock_fallback.complete(messages, tools=tools, schema=schema)
                
                data = resp.json()
                choice = data["choices"][0]["message"]
                content = choice.get("content", "")
                
                tool_calls: list[ToolCall] = []
                for tc in choice.get("tool_calls", []):
                    tool_calls.append(
                        ToolCall(
                            name=tc["function"]["name"],
                            arguments=json.loads(tc["function"]["arguments"]),
                            call_id=tc.get("id"),
                        )
                    )

                usage = data.get("usage", {})
                return LLMResult(
                    content=content,
                    tool_calls=tool_calls,
                    tokens_in=usage.get("prompt_tokens", 0),
                    tokens_out=usage.get("completion_tokens", 0),
                    model=self.model,
                )
        except Exception:
            return await self.mock_fallback.complete(messages, tools=tools, schema=schema)
