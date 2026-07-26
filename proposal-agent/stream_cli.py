#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "litellm>=1.55.0",
#   "pyyaml>=6",
#   "python-dotenv>=1.0.0",
# ]
# ///
"""Minimal streaming OKF consumer agent for smart-proposal-knowledge.

Supports Azure OpenAI and Anthropic via LiteLLM env vars.

Examples:
  uv run stream_cli.py "sg-incorp 有哪些 sections？"
  uv run stream_cli.py --template ph-incorp "列出 fee 相关 computation"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from litellm import completion

from okf_bundle import OKFBundle

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BUNDLE = REPO_ROOT / "smart-proposal-knowledge"

SYSTEM = """You are a Smart Proposal compose assistant. You consume an OKF knowledge bundle — do NOT invent proposal prose or fee amounts.

Agent read order (minimal tokens):
1. examples/index.md or user-given template_id
2. templates/{template_id}.md frontmatter (sections[], placeholders, export)
3. blocks/*.md and computations/*.md on demand

Use tools to load bundle facts. Cite concept ids (e.g. templates/sg-incorp) in answers.
When discussing compose: explain sections[] order, optional sections, fee_layout, and linked computations.
"""


def tool_specs() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "okf_read",
                "description": "Read one OKF concept by bundle-relative path (e.g. examples/index, templates/sg-incorp, computations/fee-table-total-column).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Bundle-relative path without .md"},
                    },
                    "required": ["path"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "okf_search",
                "description": "Keyword search across bundle markdown files.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "limit": {"type": "integer", "default": 10},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "okf_list_concepts",
                "description": "List concepts under a path prefix (e.g. templates, blocks/incorp/regions/sg).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "prefix": {"type": "string", "default": ""},
                        "limit": {"type": "integer", "default": 40},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "okf_template_sections",
                "description": "Return compose contract sections[] for a template_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "template_id": {"type": "string"},
                    },
                    "required": ["template_id"],
                },
            },
        },
    ]


def run_tool(bundle: OKFBundle, name: str, args: dict) -> str:
    try:
        if name == "okf_read":
            return json.dumps(bundle.read_concept(args["path"]), ensure_ascii=False, default=str)
        if name == "okf_search":
            return json.dumps(bundle.search(args["query"], limit=args.get("limit", 10)), ensure_ascii=False)
        if name == "okf_list_concepts":
            return json.dumps(
                bundle.list_concepts(prefix=args.get("prefix", ""), limit=args.get("limit", 40)),
                ensure_ascii=False,
            )
        if name == "okf_template_sections":
            return json.dumps(bundle.template_sections(args["template_id"]), ensure_ascii=False)
        return json.dumps({"error": f"unknown tool {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


def resolve_model(explicit: str | None) -> str:
    if explicit:
        return explicit
    if os.getenv("AZURE_API_KEY") and os.getenv("AZURE_API_BASE"):
        deployment = os.getenv("AZURE_DEPLOYMENT_NAME", "gpt-4o")
        return f"azure/{deployment}"
    if os.getenv("ANTHROPIC_API_KEY"):
        return os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    if os.getenv("OPENAI_API_KEY"):
        return os.getenv("OPENAI_MODEL", "gpt-4o")
    raise SystemExit(
        "Set model credentials: AZURE_API_KEY+AZURE_API_BASE, or ANTHROPIC_API_KEY, or OPENAI_API_KEY. "
        "See proposal-agent/.env.example"
    )


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv()

    parser = argparse.ArgumentParser(description="Streaming OKF proposal agent")
    parser.add_argument("prompt", nargs="?", default="Summarize how to compose sg-incorp from this bundle.")
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE, help="OKF bundle root (default: ../smart-proposal-knowledge)")
    parser.add_argument("--model", help="LiteLLM model id, e.g. azure/my-gpt4o or claude-sonnet-4-20250514")
    parser.add_argument("--template", help="Optional template_id hint injected into user message")
    args = parser.parse_args()

    bundle = OKFBundle(args.bundle)
    model = resolve_model(args.model)

    user = args.prompt
    if args.template:
        user = f"[template_id={args.template}] {user}"

    messages: list[dict] = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ]
    tools = tool_specs()

    while True:
        stream = completion(
            model=model,
            messages=messages,
            tools=tools,
            stream=True,
            api_base=os.getenv("AZURE_API_BASE") or None,
            api_version=os.getenv("AZURE_API_VERSION") or None,
        )

        tool_calls: dict[int, dict] = {}
        finish_reason = None
        assistant_text = ""

        for chunk in stream:
            choice = chunk.choices[0]
            finish_reason = choice.finish_reason or finish_reason
            delta = choice.delta
            if getattr(delta, "content", None):
                piece = delta.content
                assistant_text += piece
                sys.stdout.write(piece)
                sys.stdout.flush()
            if getattr(delta, "tool_calls", None):
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

        if finish_reason != "tool_calls" or not tool_calls:
            sys.stdout.write("\n")
            break

        sys.stdout.write("\n")
        assistant_msg: dict = {"role": "assistant", "content": assistant_text or None, "tool_calls": []}
        for idx in sorted(tool_calls):
            tc = tool_calls[idx]
            assistant_msg["tool_calls"].append(
                {
                    "id": tc["id"],
                    "type": "function",
                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                }
            )
        messages.append(assistant_msg)

        for idx in sorted(tool_calls):
            tc = tool_calls[idx]
            name = tc["name"]
            raw_args = tc["arguments"] or "{}"
            try:
                parsed = json.loads(raw_args)
            except json.JSONDecodeError:
                parsed = {}
            result = run_tool(bundle, name, parsed)
            print(f"\n[tool {name}]", file=sys.stderr)
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})


if __name__ == "__main__":
    main()
