"""LLM backends — OpenAI SDK (Azure + OpenAI) and Anthropic. No LiteLLM / Rust."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Protocol

Provider = Literal["azure", "openai", "anthropic"]


@dataclass
class TurnResult:
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    stop_reason: str | None = None


class ChatBackend(Protocol):
    provider: Provider

    def stream_turn(self, messages: list[dict], tools: list[dict]) -> TurnResult: ...


def _openai_tools(tools: list[dict]) -> list[dict]:
    return tools


def normalize_azure_endpoint(url: str) -> str:
    """Azure OpenAI SDK expects resource root — not .../openai (avoids double path 404)."""
    base = url.strip().rstrip("/")
    if base.endswith("/openai"):
        base = base[: -len("/openai")]
    return base


def _completion_extra(model: str) -> dict:
    """Newer Azure/OpenAI models (e.g. gpt-5.*) reject max_tokens."""
    if model.startswith("gpt-5") or model.startswith("o"):
        return {"max_completion_tokens": 4096}
    return {"max_tokens": 4096}


class OpenAICompatibleBackend:
    """Azure OpenAI and OpenAI direct — same Chat Completions API."""

    provider: Provider

    def __init__(self, client: Any, model: str, *, provider: Provider):
        self.client = client
        self.model = model
        self.provider = provider

    def stream_turn(
        self,
        messages: list[dict],
        tools: list[dict],
        *,
        on_delta: Callable[[str], None] | None = None,
    ) -> TurnResult:
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=_openai_tools(tools),
            stream=True,
            **_completion_extra(self.model),
        )
        result = TurnResult()
        tool_calls: dict[int, dict] = {}

        for chunk in stream:
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            if choice.finish_reason:
                result.stop_reason = choice.finish_reason
            delta = choice.delta
            if delta.content:
                result.text += delta.content
                if on_delta:
                    on_delta(delta.content)
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls:
                        tool_calls[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc.id:
                        tool_calls[idx]["id"] = tc.id
                    if tc.function and tc.function.name:
                        tool_calls[idx]["name"] = tc.function.name
                    if tc.function and tc.function.arguments:
                        tool_calls[idx]["arguments"] += tc.function.arguments

        for idx in sorted(tool_calls):
            tc = tool_calls[idx]
            result.tool_calls.append(
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
            )
        return result


class AnthropicBackend:
    provider: Provider = "anthropic"

    def __init__(self, client: Any, model: str):
        self.client = client
        self.model = model

    @staticmethod
    def _to_anthropic_tools(tools: list[dict]) -> list[dict]:
        out = []
        for t in tools:
            fn = t["function"]
            out.append(
                {
                    "name": fn["name"],
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters", {"type": "object", "properties": {}}),
                }
            )
        return out

    @staticmethod
    def _split_messages(messages: list[dict]) -> tuple[str, list[dict]]:
        system_parts: list[str] = []
        conv: list[dict] = []
        for m in messages:
            role = m["role"]
            if role == "system":
                system_parts.append(m.get("content") or "")
            elif role == "tool":
                conv.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": m["tool_call_id"],
                                "content": m.get("content") or "",
                            }
                        ],
                    }
                )
            elif role == "assistant" and m.get("tool_calls"):
                blocks: list[dict] = []
                if m.get("content"):
                    blocks.append({"type": "text", "text": m["content"]})
                for tc in m["tool_calls"]:
                    args = tc["function"].get("arguments") or "{}"
                    try:
                        parsed = json.loads(args) if isinstance(args, str) else args
                    except json.JSONDecodeError:
                        parsed = {}
                    blocks.append(
                        {
                            "type": "tool_use",
                            "id": tc["id"],
                            "name": tc["function"]["name"],
                            "input": parsed,
                        }
                    )
                conv.append({"role": "assistant", "content": blocks})
            else:
                conv.append({"role": role, "content": m.get("content") or ""})
        return "\n\n".join(system_parts), conv

    def stream_turn(
        self,
        messages: list[dict],
        tools: list[dict],
        *,
        on_delta: Callable[[str], None] | None = None,
    ) -> TurnResult:
        system, conv = self._split_messages(messages)
        result = TurnResult()

        with self.client.messages.stream(
            model=self.model,
            max_tokens=8192,
            system=system,
            messages=conv,
            tools=self._to_anthropic_tools(tools),
        ) as stream:
            for text in stream.text_stream:
                result.text += text
                if on_delta:
                    on_delta(text)
            final = stream.get_final_message()
            result.stop_reason = final.stop_reason

        for block in final.content:
            if block.type == "tool_use":
                result.tool_calls.append(
                    {
                        "id": block.id,
                        "type": "function",
                        "function": {
                            "name": block.name,
                            "arguments": json.dumps(block.input),
                        },
                    }
                )
        return result


def resolve_backend(explicit_provider: str | None = None, explicit_model: str | None = None) -> ChatBackend:
    if explicit_provider == "azure" or (
        not explicit_provider and os.getenv("AZURE_API_KEY") and os.getenv("AZURE_API_BASE")
    ):
        from openai import AzureOpenAI

        deployment = explicit_model or os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o")
        endpoint = normalize_azure_endpoint(os.environ["AZURE_API_BASE"])
        client = AzureOpenAI(
            api_key=os.environ["AZURE_API_KEY"],
            api_version=os.getenv("AZURE_API_VERSION", "2024-08-01-preview"),
            azure_endpoint=endpoint,
        )
        backend = OpenAICompatibleBackend(client, deployment, provider="azure")
        backend.azure_endpoint = endpoint  # type: ignore[attr-defined]
        return backend

    if explicit_provider == "anthropic" or (not explicit_provider and os.getenv("ANTHROPIC_API_KEY")):
        import anthropic

        model = explicit_model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
        return AnthropicBackend(anthropic.Anthropic(), model)

    if explicit_provider == "openai" or (not explicit_provider and os.getenv("OPENAI_API_KEY")):
        from openai import OpenAI

        model = explicit_model or os.getenv("OPENAI_MODEL", "gpt-4o")
        return OpenAICompatibleBackend(OpenAI(), model, provider="openai")

    raise SystemExit(
        "Set credentials in proposal-agent/.env:\n"
        "  Azure: AZURE_API_KEY + AZURE_API_BASE (+ AZURE_DEPLOYMENT_NAME)\n"
        "  Claude: ANTHROPIC_API_KEY\n"
        "  OpenAI: OPENAI_API_KEY\n"
        "Or pass --provider azure|anthropic|openai"
    )
