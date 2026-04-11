"use client";
import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TokenItem { text: string; id: number; }

interface ModelStat {
  name: string; provider: string; tokenCount: number;
  inputPer1M: number; estimatedCost: number; color: string;
  source: "exact" | "estimated";
}

interface TokenizeResult {
  tokens: TokenItem[]; models: ModelStat[];
  charCount: number; wordCount: number;
}

// ─── Dark-mode token palette ──────────────────────────────────────────────────
const PALETTE = [
  { bg: "rgba(59,130,246,0.18)",  text: "#93c5fd" },
  { bg: "rgba(16,185,129,0.18)",  text: "#6ee7b7" },
  { bg: "rgba(245,158,11,0.18)",  text: "#fcd34d" },
  { bg: "rgba(236,72,153,0.18)",  text: "#f9a8d4" },
  { bg: "rgba(139,92,246,0.18)",  text: "#c4b5fd" },
  { bg: "rgba(249,115,22,0.18)",  text: "#fdba74" },
  { bg: "rgba(20,184,166,0.18)",  text: "#5eead4" },
  { bg: "rgba(239,68,68,0.18)",   text: "#fca5a5" },
];

const PROVIDER_DOT: Record<string, string> = {
  OpenAI: "#10a37f", Anthropic: "#d97757",
  Groq: "#f55036", Google: "#4285f4", OpenRouter: "#6366f1",
};

const SAMPLES = [
  { label: "Short greeting",       text: "Hello! How are you doing today?" },
  { label: "System prompt",        text: "You are a helpful assistant. Always respond concisely and accurately. When uncertain, say so. Do not hallucinate facts." },
  { label: "Code snippet",         text: "function fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}" },
  { label: "Long paragraph",       text: "Large language models are trained on vast corpora of text data and learn to predict the next token in a sequence. Through this process, they develop rich internal representations of language, knowledge, and reasoning patterns that can be applied to a wide variety of downstream tasks." },
];

export default function TokenizerTab() {
  const [text, setText]               = useState("");
  const [result, setResult]           = useState<TokenizeResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx]   = useState<number | null>(null);
  const [viewMode, setViewMode]       = useState<"highlight" | "chips">("highlight");

  const analyze = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/tokenize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [text]);

  const formatCost = (c: number) =>
    c === 0 ? "$0.000000" : c < 0.000001 ? `$${c.toExponential(2)}` : `$${c.toFixed(6)}`;

  const maxCost = result ? Math.max(...result.models.map(m => m.estimatedCost), 0.000001) : 1;

  return (
    <div className="glass-dark rounded-2xl p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display font-bold text-2xl gradient-text">🔤 Token Visualizer</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            See how your text is tokenized — and what it costs — across models
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {SAMPLES.map(s => (
            <button key={s.label}
              onClick={() => { setText(s.text); setResult(null); setError(null); }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input card ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between px-4 py-2"
          style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
            Input Text
          </span>
          <div className="flex items-center gap-4">
            {text.length > 0 && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {text.length} chars
              </span>
            )}
            <button onClick={() => { setText(""); setResult(null); }}
              className="text-xs transition-colors" style={{ color: "var(--text-muted)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              Clear
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze(); }}
          placeholder="Paste your prompt, system message, or any text here..."
          className="w-full min-h-[140px] p-4 text-sm font-mono resize-y outline-none leading-relaxed"
          style={{
            background: "rgba(255,255,255,0.02)",
            color: "var(--text-primary)",
          }}
          spellCheck={false}
        />
        <div className="flex items-center justify-between px-4 py-2.5"
          style={{ background: "rgba(255,255,255,0.04)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>⌘ + Enter to analyze</span>
          <button onClick={analyze} disabled={loading || !text.trim()}
            className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--openai)", color: "#fff" }}>
            {loading
              ? <span className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing…
                </span>
              : "Analyze Tokens"}
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#fca5a5" }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left: visualization (2/3) ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Stats pills */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "GPT Tokens",  value: result.tokens.length, icon: "🔤" },
                { label: "Characters",  value: result.charCount.toLocaleString(), icon: "📝" },
                { label: "Words",       value: result.wordCount.toLocaleString(), icon: "📖" },
              ].map(s => (
                <div key={s.label} className="rounded-xl p-4 text-center"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="text-2xl">{s.icon}</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{s.value}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Token breakdown */}
            <div className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                  Token Breakdown
                  <span className="ml-2 font-normal normal-case" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                    cl100k_base · GPT-4 tokenizer
                  </span>
                </span>
                {/* View toggle */}
                <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                  {(["highlight", "chips"] as const).map(mode => (
                    <button key={mode} onClick={() => setViewMode(mode)}
                      className="text-xs px-3 py-1 rounded-md capitalize transition-all"
                      style={viewMode === mode
                        ? { background: "rgba(255,255,255,0.12)", color: "var(--text-primary)" }
                        : { color: "var(--text-muted)" }}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 min-h-[120px]" style={{ background: "rgba(0,0,0,0.2)" }}>
                {viewMode === "highlight" ? (
                  <p className="leading-8 text-sm font-mono break-words">
                    {result.tokens.map((tok, i) => {
                      const c = PALETTE[i % PALETTE.length];
                      const isHov = hoveredIdx === i;
                      return (
                        <span key={i}
                          onMouseEnter={() => setHoveredIdx(i)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          title={`#${i} · ID:${tok.id} · "${tok.text.replace(/\n/g, "\\n")}"`}
                          style={{
                            background: isHov ? c.text : c.bg,
                            color: isHov ? "#000" : c.text,
                            borderRadius: "3px",
                            padding: "2px 0",
                            cursor: "default",
                            transition: "all 0.1s",
                          }}>
                          {tok.text.replace(/ /g, "·").replace(/\n/g, "↵\n")}
                        </span>
                      );
                    })}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {result.tokens.map((tok, i) => {
                      const c = PALETTE[i % PALETTE.length];
                      const display = tok.text === " " ? "·" : tok.text === "\n" ? "↵"
                        : tok.text.replace(/\n/g, "↵").replace(/ /g, "·");
                      return (
                        <span key={i} title={`ID:${tok.id}`}
                          style={{ background: c.bg, color: c.text, border: `1px solid ${c.text}33` }}
                          className="text-xs font-mono px-1.5 py-0.5 rounded-md whitespace-pre cursor-default">
                          {display}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {hoveredIdx !== null && result.tokens[hoveredIdx] && (
                <div className="px-4 py-2 text-xs font-mono"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.03)", color: "var(--text-muted)" }}>
                  Token <span style={{ color: "var(--text-primary)" }}>#{hoveredIdx}</span>
                  {" · "}ID <span style={{ color: "var(--text-primary)" }}>{result.tokens[hoveredIdx].id}</span>
                  {" · "}
                  "<span style={{ color: "var(--text-primary)" }}>
                    {result.tokens[hoveredIdx].text.replace(/\n/g, "\\n").replace(/\t/g, "\\t")}
                  </span>"
                </div>
              )}
            </div>
          </div>

          {/* ── Right: cost table (1/3) ────────────────────────────────────── */}
          <div className="rounded-xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="px-4 py-2.5"
              style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                Cost by Model
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                Input tokens only
              </div>
            </div>

            <div className="divide-y" style={{ divideColor: "rgba(255,255,255,0.04)" }}>
              {result.models.map(m => (
                <div key={`${m.provider}-${m.name}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: PROVIDER_DOT[m.provider] ?? "#888" }} />
                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {m.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3.5">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{m.provider}</span>
                        {m.source === "estimated" && (
                          <span className="text-xs italic" style={{ color: "var(--text-muted)", opacity: 0.5 }}>~est</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {m.tokenCount.toLocaleString()}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {formatCost(m.estimatedCost)}
                      </div>
                    </div>
                  </div>
                  {/* Cost bar */}
                  <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        background: m.color,
                        width: `${(m.estimatedCost / maxCost) * 100}%`,
                        opacity: 0.8,
                      }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                Claude count via Anthropic API · prices as of 2025
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
