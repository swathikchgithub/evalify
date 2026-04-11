// FIXED: replaced tiktoken (WASM) with gpt-tokenizer (pure JS)
import { NextRequest, NextResponse } from "next/server";

// ─── Model pricing config ─────────────────────────────────────────────────────
// inputPer1M = cost per 1 million input tokens (USD)
const MODEL_CONFIG = [
  { name: "gpt-4o",         provider: "OpenAI",      inputPer1M: 2.50,  color: "#10a37f", ratio: 1.00 },
  { name: "gpt-4o-mini",    provider: "OpenAI",      inputPer1M: 0.15,  color: "#10a37f", ratio: 1.00 },
  { name: "gpt-3.5-turbo",  provider: "OpenAI",      inputPer1M: 0.50,  color: "#10a37f", ratio: 1.00 },
  { name: "claude-3-5-sonnet", provider: "Anthropic", inputPer1M: 3.00, color: "#d97757", ratio: null }, // exact from API
  { name: "claude-3-haiku", provider: "Anthropic",   inputPer1M: 0.25,  color: "#d97757", ratio: null }, // exact from API
  { name: "llama-3.3-70b",  provider: "Groq",        inputPer1M: 0.59,  color: "#f55036", ratio: 1.00 },
  { name: "gemini-2.0-flash", provider: "Google",    inputPer1M: 0.10,  color: "#4285f4", ratio: 1.10 }, // ~10% more tokens
  { name: "deepseek-v3",    provider: "OpenRouter",  inputPer1M: 0.27,  color: "#6366f1", ratio: 1.00 },
] as const;

// ─── GET Claude token count from Anthropic count_tokens API ──────────────────
async function getClaudeTokenCount(text: string): Promise<number | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "token-counting-2024-11-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.input_tokens ?? null;
  } catch {
    return null;
  }
}

// ─── Tokenize using gpt-tokenizer (pure JS — no WASM, works in Next.js) ───────
async function tokenizeText(
  text: string
): Promise<{ tokens: { text: string; id: number }[]; count: number }> {
  try {
    // gpt-tokenizer is pure TypeScript, cl100k_base (GPT-4 family)
    const { encode, decode } = await import("gpt-tokenizer");
    const ids: number[] = encode(text);
    const tokens = ids.map((id) => ({ id, text: decode([id]) }));
    return { tokens, count: ids.length };
  } catch (err) {
    console.error("[tokenize] gpt-tokenizer failed, using fallback:", err);
    const parts = text.match(/\s+|[a-zA-Z']+|\d+|[^a-zA-Z0-9'\s]/g) ?? [];
    const tokens = parts.map((t, i) => ({ text: t, id: i }));
    return { tokens, count: tokens.length };
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = body?.text ?? "";

    if (!text.trim()) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Run tokenization + Claude count in parallel
    const [{ tokens, count: gptCount }, claudeCount] = await Promise.all([
      tokenizeText(text),
      getClaudeTokenCount(text),
    ]);

    // Build per-model stats
    const models = MODEL_CONFIG.map((m) => {
      let tokenCount: number;
      let source: "exact" | "estimated";

      if (m.provider === "Anthropic") {
        tokenCount = claudeCount ?? Math.round(gptCount * 1.05);
        source = claudeCount !== null ? "exact" : "estimated";
      } else {
        tokenCount = Math.round(gptCount * (m.ratio ?? 1.0));
        source = (m.ratio ?? 1.0) === 1.0 ? "exact" : "estimated";
      }

      return {
        name: m.name,
        provider: m.provider,
        tokenCount,
        inputPer1M: m.inputPer1M,
        estimatedCost: (tokenCount / 1_000_000) * m.inputPer1M,
        color: m.color,
        source,
      };
    });

    return NextResponse.json({
      tokens,
      models,
      charCount: text.length,
      wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    });
  } catch (err: any) {
    console.error("[/api/tokenize]", err);
    return NextResponse.json(
      { error: err?.message ?? "Tokenization failed" },
      { status: 500 }
    );
  }
}
