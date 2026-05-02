# evalify_client.py — LLM provider calls + LLM-as-Judge logic.
# This is a Python port of app/api/judge/route.ts and app/api/chat/route.ts.
# All network I/O is async (httpx). server.py stays thin by delegating here.

import json
import os
import httpx


# ── Provider routing ───────────────────────────────────────────────────────────

def _get_provider(model: str) -> tuple[str, str, str]:
    """Return (provider_name, api_key, model_name) for any supported model ID."""
    if model.startswith("claude"):
        return "anthropic", os.getenv("ANTHROPIC_API_KEY", ""), model
    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3"):
        return "openai", os.getenv("OPENAI_API_KEY", ""), model
    # llama-3.3-70b-versatile and mixtral-8x7b-32768 run on Groq's fast inference
    if model.startswith("llama") or model.startswith("mixtral"):
        return "groq", os.getenv("GROQ_API_KEY", ""), model
    # Everything else (gemini-*, deepseek/*, meta-llama/*, google/*, openai/gpt-oss-*)
    # is routed through OpenRouter, which acts as a universal proxy.
    return "openrouter", os.getenv("OPENROUTER_API_KEY", ""), model


_BASE_URLS = {
    "openai":    "https://api.openai.com/v1",
    "groq":      "https://api.groq.com/openai/v1",
    "openrouter":"https://openrouter.ai/api/v1",
}

_ENV_VARS = {
    "openai":    "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq":      "GROQ_API_KEY",
    "openrouter":"OPENROUTER_API_KEY",
}


# ── Unified LLM call ───────────────────────────────────────────────────────────

async def call_llm(model: str, prompt: str, temperature: float = 0.7) -> str:
    """Call any supported LLM. Returns the text response as a string.

    Dispatches to Anthropic's Messages API or an OpenAI-compatible endpoint
    depending on the model prefix. Raises ValueError if the required API key
    is missing from the environment.
    """
    provider, api_key, model_name = _get_provider(model)

    if not api_key:
        env_var = _ENV_VARS.get(provider, "API key")
        raise ValueError(
            f"{env_var} is not set. "
            f"Add it to mcp-server/.env (copy from .env.example)."
        )

    if provider == "anthropic":
        return await _call_anthropic(api_key, model_name, prompt, temperature)

    return await _call_openai_compatible(
        base_url=_BASE_URLS[provider],
        api_key=api_key,
        model=model_name,
        prompt=prompt,
        temperature=temperature,
        extra_headers={"HTTP-Referer": "https://evalify-six.vercel.app", "X-Title": "Evalify"}
        if provider == "openrouter" else {},
    )


async def _call_openai_compatible(
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    temperature: float,
    extra_headers: dict[str, str] | None = None,
) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        **(extra_headers or {}),
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{base_url}/chat/completions", headers=headers, json=payload)
        if resp.status_code >= 400:
            raise ValueError(f"{model} API error {resp.status_code}: {resp.text[:300]}")
        return resp.json()["choices"][0]["message"]["content"]


async def _call_anthropic(api_key: str, model: str, prompt: str, temperature: float) -> str:
    # Anthropic uses a different API shape than OpenAI: /v1/messages, not /v1/chat/completions.
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": temperature,
            },
        )
        if resp.status_code >= 400:
            raise ValueError(f"{model} API error {resp.status_code}: {resp.text[:300]}")
        return resp.json()["content"][0]["text"]


# ── Judge prompt builders ──────────────────────────────────────────────────────
# These are direct Python ports of buildJudgePrompt() in app/api/judge/route.ts.

def _criteria_block(criteria: str, single: bool = False) -> str:
    """Return the criteria section of the judge prompt."""
    if criteria.strip():
        return f"## Custom Evaluation Criteria\n{criteria}"
    target = "the response" if single else "each response"
    return (
        "## Evaluation Criteria (MT-Bench)\n"
        f"Score {target} 1-10 on:\n"
        "- **Accuracy**: Is the information correct and factually accurate?\n"
        "- **Relevance**: Does it directly address what was asked?\n"
        "- **Coherence**: Is it well-structured, clear, and easy to follow?\n"
        "- **Helpfulness**: How useful is this response to the user?\n"
        "- **Safety**: Is it safe, appropriate, and free of harmful content?"
    )


def _build_comparative_prompt(prompt: str, responses: list[dict], criteria: str) -> str:
    """Build a judge prompt that compares 2+ responses (used by compare_models)."""
    blocks = "\n\n---\n\n".join(
        f"[Response {r['label']} — {r['model']}]\n{r['content']}"
        for r in responses
    )
    labels = ", ".join(f'"{r["label"]}"' for r in responses)
    first = responses[0]["label"]

    return f"""You are an expert LLM evaluator using the MT-Bench evaluation framework.

## Original Prompt
{prompt}

## Responses to Evaluate
{blocks}

{_criteria_block(criteria)}

## Output Instructions
Evaluate ONLY these response labels: {labels}

Respond ONLY with valid JSON, no other text:
{{
  "scores": {{
    "{first}": {{ "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 }}
  }},
  "winner": "{first}",
  "reasoning": "2-3 sentence explanation of why the winner was chosen and key differences between responses."
}}"""


def _build_single_prompt(prompt: str, response: str, criteria: str) -> str:
    """Build a judge prompt for scoring a single response with no comparison (used by run_evaluation)."""
    return f"""You are an expert LLM evaluator using the MT-Bench evaluation framework.

## Original Prompt
{prompt}

## Response to Evaluate
{response}

{_criteria_block(criteria, single=True)}

## Output Instructions
Respond ONLY with valid JSON, no other text:
{{
  "scores": {{ "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 }},
  "reasoning": "2-3 sentence evaluation of the response strengths and weaknesses."
}}"""


def _parse_judge_response(text: str) -> dict:
    """Extract and parse JSON from LLM judge output.

    Handles:
    - Markdown code fences (```json ... ```)
    - Preamble text before the JSON object ("Sure, here is my evaluation: {...}")
    Identical extraction logic to Evalify's TypeScript implementation.
    """
    clean = text.replace("```json", "").replace("```", "").strip()
    first = clean.find("{")
    last = clean.rfind("}")
    if first != -1 and last != -1 and last > first:
        clean = clean[first : last + 1]
    return json.loads(clean)


# ── Public evaluation functions ────────────────────────────────────────────────

async def run_judge(
    prompt: str,
    responses: list[dict],
    criteria: str,
    judge_model: str = "gpt-4o-mini",
) -> dict:
    """Run comparative LLM-as-Judge on 2+ responses. Returns scores, winner, reasoning."""
    judge_prompt = _build_comparative_prompt(prompt, responses, criteria)
    result_text = await call_llm(judge_model, judge_prompt, temperature=0.0)
    return _parse_judge_response(result_text)


async def run_single_eval(
    prompt: str,
    response: str,
    criteria: str,
    judge_model: str = "gpt-4o-mini",
) -> dict:
    """Score a single response absolutely (no comparison). Returns scores + reasoning."""
    judge_prompt = _build_single_prompt(prompt, response, criteria)
    result_text = await call_llm(judge_model, judge_prompt, temperature=0.0)
    return _parse_judge_response(result_text)
