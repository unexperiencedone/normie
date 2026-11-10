from __future__ import annotations
import json
import os
import asyncio
from typing import Any
import boto3
from pydantic import BaseModel

from backend.llm.base import LLMResult, ToolCall
from backend.llm.mock import MockAdapter


class BedrockNemotronLLM:
    """Amazon Bedrock client specifically configured for NVIDIA Nemotron models:
    - nvidia.nemotron-super-3-120b
    - nvidia.nemotron-nano-3-30b
    - nvidia.nemotron-nano-12b-v2
    Supports AWS_ACCESS_KEY, AWS_SECRET_KEY, AWS_REGION, and LLM_MODEL from environment.
    Falls back gracefully to MockAdapter if credentials fail or are missing.
    """

    def __init__(
        self,
        aws_access_key: str | None = None,
        aws_secret_key: str | None = None,
        region_name: str | None = None,
        model_id: str | None = None,
        timeout_s: float = 30.0,
    ) -> None:
        self.aws_access_key = (
            aws_access_key
            or os.getenv("AWS_ACCESS_KEY")
            or os.getenv("AWS_ACCESS_KEY_ID")
        )
        self.aws_secret_key = (
            aws_secret_key
            or os.getenv("AWS_SECRET_KEY")
            or os.getenv("AWS_SECRET_ACCESS_KEY")
        )
        self.region_name = region_name or os.getenv("AWS_REGION", "us-east-1")
        self.model_id = model_id or os.getenv("LLM_MODEL", "nvidia.nemotron-super-3-120b")
        self.timeout_s = timeout_s
        self.mock_fallback = MockAdapter()

        self._client = None
        if self.aws_access_key and self.aws_secret_key:
            try:
                self._client = boto3.client(
                    "bedrock-runtime",
                    aws_access_key_id=self.aws_access_key,
                    aws_secret_access_key=self.aws_secret_key,
                    region_name=self.region_name,
                )
            except Exception as e:
                print(f"Failed to initialize boto3 Bedrock client: {e}")

    async def complete(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        schema: type[BaseModel] | dict[str, Any] | None = None,
    ) -> LLMResult:
        if not self._client:
            return await self.mock_fallback.complete(messages, tools=tools, schema=schema)

        # Separate system messages from conversation messages for Bedrock Converse API
        system_prompts: list[dict[str, str]] = []
        bedrock_messages: list[dict[str, Any]] = []

        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                system_prompts.append({"text": content})
            else:
                bedrock_messages.append({
                    "role": "user" if role == "user" else "assistant",
                    "content": [{"text": content}],
                })

        # Ensure there's at least one message
        if not bedrock_messages:
            bedrock_messages.append({"role": "user", "content": [{"text": "Hello"}]})

        inference_config = {
            "temperature": 0.2,
            "maxTokens": 1024,
            "topP": 0.7,
        }

        # Run synchronous boto3 call in thread pool executor
        loop = asyncio.get_running_loop()
        try:
            def _invoke():
                kwargs: dict[str, Any] = {
                    "modelId": self.model_id,
                    "messages": bedrock_messages,
                    "inferenceConfig": inference_config,
                }
                if system_prompts:
                    kwargs["system"] = system_prompts
                return self._client.converse(**kwargs)

            response = await loop.run_in_executor(None, _invoke)
            output_msg = response["output"]["message"]
            text_chunks = [c["text"] for c in output_msg.get("content", []) if "text" in c]
            text = "\n".join(text_chunks)

            usage = response.get("usage", {})
            return LLMResult(
                content=text,
                tool_calls=[],
                tokens_in=usage.get("inputTokens", 0),
                tokens_out=usage.get("outputTokens", 0),
                model=self.model_id,
            )
        except Exception as err:
            print(f"Bedrock Nemotron converse failed: {err}. Falling back to mock adapter.")
            return await self.mock_fallback.complete(messages, tools=tools, schema=schema)
