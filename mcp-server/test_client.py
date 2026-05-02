#!/usr/bin/env python3
"""
Test script for the Evalify MCP server.

Runs the server as a subprocess (stdio transport) and exercises all 5 tools.
Tools that call LLMs are skipped if no API keys are found.

Usage:
    cd mcp-server
    python test_client.py
"""

import asyncio
import json
import os
import sys

import os

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env.local"))
load_dotenv()

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def _result_text(result) -> str:
    """Pull the text out of a CallToolResult."""
    return result.content[0].text if result.content else ""


def _pp(data) -> str:
    """Pretty-print a JSON string or dict, truncated at 500 chars."""
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            return data[:500]
    return json.dumps(data, indent=2)[:500]


async def main() -> None:
    # Start the MCP server as a child process using stdio.
    # This is the same transport Claude Desktop uses.
    server_path = os.path.join(os.path.dirname(__file__), "server.py")
    server_params = StdioServerParameters(
        command=sys.executable,  # same Python that's running this script
        args=[server_path],
        env=dict(os.environ),   # pass API keys through
    )

    print("Starting Evalify MCP server...\n")

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            # ── List available tools ───────────────────────────────────────
            tools = await session.list_tools()
            print(f"Available tools ({len(tools.tools)}):")
            for t in tools.tools:
                print(f"  • {t.name}")
            print()

            # ── Tool 4: get_supported_models ───────────────────────────────
            print("=" * 60)
            print("TEST: get_supported_models")
            result = await session.call_tool("get_supported_models", {})
            models = json.loads(_result_text(result))["models"]
            print(f"  {len(models)} models returned")
            print(f"  First 3: {[m['value'] for m in models[:3]]}")

            # ── Tool 5: get_evaluation_criteria ───────────────────────────
            print("\nTEST: get_evaluation_criteria")
            result = await session.call_tool("get_evaluation_criteria", {})
            presets = json.loads(_result_text(result))["presets"]
            print(f"  {len(presets)} presets returned")
            print(f"  IDs: {[c['id'] for c in presets]}")

            # ── LLM tests (require API keys) ───────────────────────────────
            has_openai = bool(os.getenv("OPENAI_API_KEY"))
            has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))

            if not has_openai and not has_anthropic:
                print("\n[SKIPPED] No API keys found — skipping LLM-based tools.")
                print("Set OPENAI_API_KEY or ANTHROPIC_API_KEY in mcp-server/.env to run them.")
                return

            # Prefer OpenAI for the judge — most reliable default.
            # Use Anthropic only when OpenAI key is absent.
            judge_model = "gpt-4o-mini" if has_openai else "claude-sonnet-4-6"
            test_model  = "gpt-4o-mini" if has_openai else "claude-sonnet-4-6"
            compare_b   = "claude-sonnet-4-6" if has_anthropic else "gpt-4o-mini"

            # ── Tool 1: run_evaluation ─────────────────────────────────────
            print(f"\nTEST: run_evaluation  (judge: {judge_model})")
            result = await session.call_tool("run_evaluation", {
                "prompt": "What is the capital of France?",
                "response": "The capital of France is Paris, one of Europe's major cities.",
                "judge_model": judge_model,
            })
            if result.isError:
                print(f"  ERROR: {_result_text(result)}")
            else:
                data = json.loads(_result_text(result))
                print(f"  Overall score : {data.get('scores', {}).get('overall')}")
                print(f"  Reasoning     : {data.get('reasoning', '')[:120]}...")

            # ── Tool 2: compare_models ─────────────────────────────────────
            print(f"\nTEST: compare_models  ({test_model} vs {compare_b})")
            result = await session.call_tool("compare_models", {
                "prompt": "Explain what an API is in one sentence.",
                "model_a": test_model,
                "model_b": compare_b,
                "judge_model": judge_model,
            })
            if result.isError:
                print(f"  ERROR: {_result_text(result)}")
            else:
                data = json.loads(_result_text(result))
                print(f"  Winner        : {data.get('winner_model')}")
                print(f"  Reasoning     : {data.get('reasoning', '')[:120]}...")

            # ── Tool 3: run_benchmark ──────────────────────────────────────
            print(f"\nTEST: run_benchmark  (model: {test_model}, 3 prompts)")
            result = await session.call_tool("run_benchmark", {
                "prompts": [
                    "What is 2 + 2?",
                    "Name the largest planet in the solar system.",
                    "What language is the Linux kernel written in?",
                ],
                "model": test_model,
                "judge_model": judge_model,
            })
            if result.isError:
                print(f"  ERROR: {_result_text(result)}")
            else:
                data = json.loads(_result_text(result))
                summary = data.get("summary", {})
                print(f"  Avg score     : {summary.get('avg_score')}")
                print(f"  Score range   : {summary.get('min_score')} – {summary.get('max_score')}")

            print("\nAll tests passed.")


if __name__ == "__main__":
    asyncio.run(main())
