#!/usr/bin/env python3
"""Minimal streaming OKF consumer agent for smart-proposal-knowledge.

Supports Azure OpenAI, OpenAI, and Anthropic (native SDKs — no LiteLLM).

Examples:
  cd proposal-agent && uv run stream_cli.py "sg-incorp 有哪些 sections？"
  uv run stream_cli.py --template ph-incorp "Total 列用哪个 computation？"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

from llm import resolve_backend
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


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv()

    parser = argparse.ArgumentParser(description="Streaming OKF proposal agent")
    parser.add_argument("prompt", nargs="?", default="Summarize how to compose sg-incorp from this bundle.")
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE, help="OKF bundle root (default: ../smart-proposal-knowledge)")
    parser.add_argument("--provider", choices=["azure", "openai", "anthropic"], help="LLM provider (default: auto from .env)")
    parser.add_argument("--model", help="Model or Azure deployment name")
    parser.add_argument("--template", help="Optional template_id hint injected into user message")
    args = parser.parse_args()

    bundle = OKFBundle(args.bundle)
    backend = resolve_backend(args.provider, args.model)

    user = args.prompt
    if args.template:
        user = f"[template_id={args.template}] {user}"

    messages: list[dict] = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ]
    tools = tool_specs()

    print(f"[provider={backend.provider}]", file=sys.stderr)
    if getattr(backend, "azure_endpoint", None):
        print(f"[azure_endpoint={backend.azure_endpoint}]", file=sys.stderr)

    while True:
        def write_delta(piece: str) -> None:
            sys.stdout.write(piece)
            sys.stdout.flush()

        turn = backend.stream_turn(messages, tools, on_delta=write_delta)

        if not turn.tool_calls:
            sys.stdout.write("\n")
            break

        sys.stdout.write("\n")
        messages.append(
            {
                "role": "assistant",
                "content": turn.text or None,
                "tool_calls": turn.tool_calls,
            }
        )

        for tc in turn.tool_calls:
            name = tc["function"]["name"]
            raw_args = tc["function"].get("arguments") or "{}"
            try:
                parsed = json.loads(raw_args)
            except json.JSONDecodeError:
                parsed = {}
            result = run_tool(bundle, name, parsed)
            print(f"[tool {name}]", file=sys.stderr)
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result})


if __name__ == "__main__":
    main()
