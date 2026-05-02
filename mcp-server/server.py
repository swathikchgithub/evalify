#!/usr/bin/env python3
"""
Evalify MCP Server — exposes LLM evaluation capabilities as MCP tools.

Usage:
  python server.py              # stdio transport  (Claude Desktop, Claude Code)
  python server.py --sse        # SSE/HTTP transport on port 8000 (production)
  python server.py --sse --port 9000  # custom port
"""

import argparse
import asyncio
import sys

import os

from dotenv import load_dotenv

# Load from Evalify's root .env.local — single source of truth for API keys.
# Falls back to a local .env if running the server outside the repo.
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env.local"))
load_dotenv()

# Parse --sse / --host / --port before creating FastMCP so we can pass host+port
# to the constructor (this version of the SDK requires them at construction time).
_parser = argparse.ArgumentParser(description="Evalify MCP Server", add_help=False)
_parser.add_argument("--sse", action="store_true")
_parser.add_argument("--host", default="0.0.0.0")
_parser.add_argument("--port", type=int, default=8000)
_args, _remaining = _parser.parse_known_args()

from mcp.server.fastmcp import FastMCP

from constants import EVAL_CRITERIA_PRESETS, MODELS
from evalify_client import call_llm, run_judge, run_single_eval

mcp = FastMCP(
    "evalify-mcp",
    instructions=(
        "Evalify LLM evaluation platform. "
        "Run LLM-as-Judge evaluations, compare models head-to-head, "
        "and benchmark a model across multiple prompts."
    ),
    host=_args.host,
    port=_args.port,
)

_DEFAULT_JUDGE = "gpt-4o-mini"


# ── Tool 1: run_evaluation ─────────────────────────────────────────────────────

@mcp.tool()
async def run_evaluation(
    prompt: str,
    response: str,
    criteria: str = "",
    judge_model: str = _DEFAULT_JUDGE,
) -> dict:
    """Score a single LLM response using LLM-as-Judge (MT-Bench framework).

    Args:
        prompt: The original question or task given to the LLM.
        response: The LLM's response to evaluate.
        criteria: Evaluation focus. Empty string = MT-Bench (accuracy, relevance,
                  coherence, helpfulness, safety 1-10). Pass a criteria preset
                  'value' from get_evaluation_criteria() for domain-specific scoring.
        judge_model: Model to use as judge. Default: gpt-4o-mini.
                     Run get_supported_models() to see all options.

    Returns:
        {
          "scores": {"accuracy": 8, "relevance": 9, ..., "overall": 8.5},
          "reasoning": "The response correctly identified..."
        }
    """
    return await run_single_eval(prompt, response, criteria, judge_model)


# ── Tool 2: compare_models ─────────────────────────────────────────────────────

@mcp.tool()
async def compare_models(
    prompt: str,
    model_a: str,
    model_b: str,
    criteria: str = "",
    judge_model: str = _DEFAULT_JUDGE,
) -> dict:
    """Compare two LLM models on the same prompt using LLM-as-Judge.

    Calls both models in parallel, then runs comparative evaluation.

    Args:
        prompt: The prompt to send to both models.
        model_a: First model ID (e.g. "gpt-4o-mini", "claude-sonnet-4-6").
        model_b: Second model ID (e.g. "llama-3.3-70b-versatile", "deepseek/deepseek-chat").
        criteria: Evaluation criteria. Empty string = MT-Bench.
        judge_model: Judge model. Default: gpt-4o-mini.

    Returns:
        {
          "prompt": "...",
          "responses": {"gpt-4o-mini": "...", "claude-sonnet-4-6": "..."},
          "scores": {"A": {...}, "B": {...}},
          "winner": "A",
          "winner_model": "gpt-4o-mini",
          "reasoning": "Model A was more concise and accurate..."
        }
    """
    # Both API calls happen at the same time — no waiting for one before starting the other.
    response_a, response_b = await asyncio.gather(
        call_llm(model_a, prompt),
        call_llm(model_b, prompt),
    )

    responses = [
        {"label": "A", "model": model_a, "content": response_a},
        {"label": "B", "model": model_b, "content": response_b},
    ]

    result = await run_judge(prompt, responses, criteria, judge_model)

    winner_label = result.get("winner", "A")
    winner_model = model_a if winner_label == "A" else model_b

    return {
        "prompt": prompt,
        "responses": {model_a: response_a, model_b: response_b},
        "scores": result.get("scores", {}),
        "winner": winner_label,
        "winner_model": winner_model,
        "reasoning": result.get("reasoning", ""),
    }


# ── Tool 3: run_benchmark ──────────────────────────────────────────────────────

@mcp.tool()
async def run_benchmark(
    prompts: list[str],
    criteria: str = "",
    model: str = "gpt-4o-mini",
    judge_model: str = _DEFAULT_JUDGE,
) -> dict:
    """Benchmark a model across multiple prompts using LLM-as-Judge.

    For each prompt: generates a response from `model`, then scores it with `judge_model`.
    All generations and evaluations run concurrently for speed.

    Args:
        prompts: List of test prompts to run the model on.
        criteria: Evaluation criteria. Empty string = MT-Bench.
        model: The model being benchmarked (generates responses).
        judge_model: The judge model (scores responses). Default: gpt-4o-mini.

    Returns:
        {
          "summary": {"model": "gpt-4o-mini", "avg_score": 8.3, "min": 7.1, "max": 9.5, ...},
          "results": [{"prompt": "...", "response": "...", "scores": {...}, "reasoning": "..."}]
        }
    """
    if not prompts:
        return {"error": "prompts list cannot be empty"}

    # Step 1: generate all responses in parallel
    responses = await asyncio.gather(*[call_llm(model, p) for p in prompts])

    # Step 2: evaluate all responses in parallel
    evaluations = await asyncio.gather(*[
        run_single_eval(p, r, criteria, judge_model)
        for p, r in zip(prompts, responses)
    ])

    results = [
        {
            "prompt": p,
            "response": r,
            "scores": e.get("scores", {}),
            "reasoning": e.get("reasoning", ""),
        }
        for p, r, e in zip(prompts, responses, evaluations)
    ]

    overall_scores = [
        res["scores"]["overall"]
        for res in results
        if isinstance(res["scores"].get("overall"), (int, float))
    ]

    summary = {
        "model": model,
        "judge": judge_model,
        "total_prompts": len(prompts),
        "avg_score": round(sum(overall_scores) / len(overall_scores), 2) if overall_scores else None,
        "min_score": min(overall_scores) if overall_scores else None,
        "max_score": max(overall_scores) if overall_scores else None,
    }

    return {"summary": summary, "results": results}


# ── Tool 4: get_supported_models ───────────────────────────────────────────────

@mcp.tool()
def get_supported_models() -> dict:
    """Return all LLM models supported by Evalify.

    Returns {"models": [...]} where each item has:
        - value: the model ID to pass to compare_models() or run_benchmark()
        - label: human-readable name and provider
        - requires_key: which .env variable must be set to use this model
    """
    return {"models": MODELS}


# ── Tool 5: get_evaluation_criteria ───────────────────────────────────────────

@mcp.tool()
def get_evaluation_criteria() -> dict:
    """Return all evaluation criteria presets available in Evalify.

    Returns {"presets": [...]} where each item has:
        - id: short identifier (e.g. "code-quality", "rag-qa")
        - label: human-readable name
        - description: what dimensions are scored
        - criteria: the full text to pass as the 'criteria' argument

    Pass the 'criteria' value to run_evaluation(), compare_models(), or run_benchmark().
    An empty string uses the default MT-Bench scoring.
    """
    return {"presets": EVAL_CRITERIA_PRESETS}


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if _args.sse:
        print(
            f"Evalify MCP Server starting (SSE) → http://{_args.host}:{_args.port}/sse",
            file=sys.stderr,
        )
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")
