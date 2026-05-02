'use client';

import { useState } from 'react';
import { MODELS, JUDGE_MODELS } from '../../config/evalify-constants';
import { EVAL_CRITERIA_PRESETS } from '../../config/evalify-kserve-presets';

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'run_evaluation',
    icon: '🔬',
    label: 'run_evaluation',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.1)',
    border: 'rgba(99,102,241,0.25)',
    plain: 'Give it a question + one answer. A judge AI scores that answer 1–10 and explains why.',
    description: 'Score a single LLM response using LLM-as-Judge (MT-Bench framework). Returns per-dimension scores + reasoning.',
    schema: `{
  "name": "run_evaluation",
  "description": "Score a single LLM response using LLM-as-Judge",
  "inputSchema": {
    "type": "object",
    "required": ["prompt", "response"],
    "properties": {
      "prompt":      { "type": "string" },
      "response":    { "type": "string" },
      "criteria":    { "type": "string", "default": "" },
      "judge_model": { "type": "string", "default": "gpt-4o-mini" }
    }
  }
}`,
  },
  {
    name: 'compare_models',
    icon: '⚔️',
    label: 'compare_models',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.25)',
    plain: 'Give it a question + two AI names. It asks both AIs, then a judge decides who answered better.',
    description: 'Compare two LLM models on the same prompt. Calls both models in parallel, then runs LLM-as-Judge on both responses.',
    schema: `{
  "name": "compare_models",
  "description": "Compare two LLM models head-to-head using LLM-as-Judge",
  "inputSchema": {
    "type": "object",
    "required": ["prompt", "model_a", "model_b"],
    "properties": {
      "prompt":      { "type": "string" },
      "model_a":     { "type": "string" },
      "model_b":     { "type": "string" },
      "criteria":    { "type": "string", "default": "" },
      "judge_model": { "type": "string", "default": "gpt-4o-mini" }
    }
  }
}`,
  },
  {
    name: 'run_benchmark',
    icon: '📊',
    label: 'run_benchmark',
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.25)',
    plain: 'Give it several questions + one AI name. It tests all of them and gives you a report card with scores.',
    description: 'Benchmark a model across multiple prompts. Generates responses and evaluates each one in parallel. Returns per-prompt scores + aggregate stats.',
    schema: `{
  "name": "run_benchmark",
  "description": "Benchmark a model across multiple prompts with aggregate scores",
  "inputSchema": {
    "type": "object",
    "required": ["prompts"],
    "properties": {
      "prompts":     { "type": "array", "items": { "type": "string" } },
      "criteria":    { "type": "string", "default": "" },
      "model":       { "type": "string", "default": "gpt-4o-mini" },
      "judge_model": { "type": "string", "default": "gpt-4o-mini" }
    }
  }
}`,
  },
  {
    name: 'get_supported_models',
    icon: '🤖',
    label: 'get_supported_models',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.1)',
    border: 'rgba(59,130,246,0.25)',
    plain: 'No inputs needed. Returns the full list of AI models Evalify supports, so an agent knows what to pick from.',
    description: 'List all 17 LLM models supported by Evalify — OpenAI, Anthropic, Groq, OpenRouter — with provider info.',
    schema: `{
  "name": "get_supported_models",
  "description": "List all supported LLM models with provider and API key info",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}`,
  },
  {
    name: 'get_evaluation_criteria',
    icon: '📋',
    label: 'get_evaluation_criteria',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.1)',
    border: 'rgba(139,92,246,0.25)',
    plain: 'No inputs needed. Returns the 9 scoring frameworks — so an agent knows how to ask for the right kind of evaluation.',
    description: 'List all 9 evaluation criteria presets: MT-Bench, Code Quality, RAG/QA, Safety, Business, Educational, Medical, Legal, Customer Support.',
    schema: `{
  "name": "get_evaluation_criteria",
  "description": "List all evaluation criteria presets for domain-specific scoring",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}`,
  },
] as const;

type ToolName = (typeof TOOLS)[number]['name'];

// ── State ──────────────────────────────────────────────────────────────────────

type ToolState = {
  view:    'schema' | 'try';
  loading: boolean;
  result:  unknown;
  error:   string | null;
  args:    Record<string, string>;
};

function initArgs(name: ToolName): Record<string, string> {
  if (name === 'run_evaluation')  return { prompt: 'What is the capital of France?', response: 'The capital of France is Paris.', criteria: '', judge_model: 'gpt-4o-mini' };
  if (name === 'compare_models')  return { prompt: 'Explain recursion in one sentence.', model_a: 'gpt-4o-mini', model_b: 'gpt-4o', criteria: '', judge_model: 'gpt-4o-mini' };
  if (name === 'run_benchmark')   return { prompts: 'What is 2+2?\nName the largest planet.\nWhat language is Linux written in?', criteria: '', model: 'gpt-4o-mini', judge_model: 'gpt-4o-mini' };
  return {};
}

function initState(): Record<ToolName, ToolState> {
  return Object.fromEntries(
    TOOLS.map(t => [t.name, { view: 'schema', loading: false, result: null, error: null, args: initArgs(t.name as ToolName) }])
  ) as Record<ToolName, ToolState>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function prettyJSON(v: unknown): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function buildMcpCall(tool: ToolName, args: Record<string, string>): string {
  const cleanArgs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (!v) continue;
    if (k === 'prompts') cleanArgs[k] = v.split('\n').map(s => s.trim()).filter(Boolean);
    else cleanArgs[k] = v;
  }
  return prettyJSON({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: cleanArgs } });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-[10px] px-2 py-0.5 rounded transition-all"
      style={{ background: 'rgba(255,255,255,0.07)', color: copied ? '#10b981' : '#888', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  );
}

function CodeBlock({ label, content, color }: { label: string; content: string; color: string }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>{label}</span>
        <CopyButton text={content} />
      </div>
      <pre className="text-[11px] rounded-lg p-3 overflow-auto font-mono leading-relaxed"
        style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.07)', color: '#c9d1d9', maxHeight: 280 }}>
        {content}
      </pre>
    </div>
  );
}

// ── Tool form ──────────────────────────────────────────────────────────────────

function ToolForm({ tool, state, onChange }: {
  tool: typeof TOOLS[number];
  state: ToolState;
  onChange: (key: string, val: string) => void;
}) {
  const inputCls = "w-full rounded-lg px-3 py-2 text-sm font-mono outline-none transition-all";
  const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' };
  const labelCls = "block text-[11px] font-semibold mb-1";

  if (tool.name === 'get_supported_models' || tool.name === 'get_evaluation_criteria') {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No parameters required — click Run Tool.</p>;
  }

  if (tool.name === 'run_evaluation') return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} style={{ color: tool.color }}>prompt</label>
        <input className={inputCls} style={inputStyle} value={state.args.prompt ?? ''} onChange={e => onChange('prompt', e.target.value)} placeholder="Original question or task" />
      </div>
      <div>
        <label className={labelCls} style={{ color: tool.color }}>response</label>
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={state.args.response ?? ''} onChange={e => onChange('response', e.target.value)} placeholder="The LLM response to evaluate" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} style={{ color: tool.color }}>criteria</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.criteria ?? ''} onChange={e => onChange('criteria', e.target.value)}>
            {EVAL_CRITERIA_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: tool.color }}>judge_model</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.judge_model ?? 'gpt-4o-mini'} onChange={e => onChange('judge_model', e.target.value)}>
            {JUDGE_MODELS.filter(m => m.value !== 'custom').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  if (tool.name === 'compare_models') return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} style={{ color: tool.color }}>prompt</label>
        <input className={inputCls} style={inputStyle} value={state.args.prompt ?? ''} onChange={e => onChange('prompt', e.target.value)} placeholder="Prompt to send to both models" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} style={{ color: tool.color }}>model_a</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.model_a ?? 'gpt-4o-mini'} onChange={e => onChange('model_a', e.target.value)}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: tool.color }}>model_b</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.model_b ?? 'gpt-4o'} onChange={e => onChange('model_b', e.target.value)}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls} style={{ color: tool.color }}>criteria</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.criteria ?? ''} onChange={e => onChange('criteria', e.target.value)}>
            {EVAL_CRITERIA_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: tool.color }}>judge_model</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.judge_model ?? 'gpt-4o-mini'} onChange={e => onChange('judge_model', e.target.value)}>
            {JUDGE_MODELS.filter(m => m.value !== 'custom').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  if (tool.name === 'run_benchmark') return (
    <div className="space-y-3">
      <div>
        <label className={labelCls} style={{ color: tool.color }}>prompts <span className="font-normal opacity-60">(one per line)</span></label>
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }} value={state.args.prompts ?? ''} onChange={e => onChange('prompts', e.target.value)} placeholder={"What is 2+2?\nName the largest planet.\nWhat language is Linux written in?"} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls} style={{ color: tool.color }}>model</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.model ?? 'gpt-4o-mini'} onChange={e => onChange('model', e.target.value)}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: tool.color }}>criteria</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.criteria ?? ''} onChange={e => onChange('criteria', e.target.value)}>
            {EVAL_CRITERIA_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls} style={{ color: tool.color }}>judge_model</label>
          <select className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} value={state.args.judge_model ?? 'gpt-4o-mini'} onChange={e => onChange('judge_model', e.target.value)}>
            {JUDGE_MODELS.filter(m => m.value !== 'custom').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MCPTab() {
  const [states, setStates]         = useState<Record<ToolName, ToolState>>(initState);
  const [explainerOpen, setExplainerOpen] = useState(false);

  function update(name: ToolName, patch: Partial<ToolState>) {
    setStates(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function setArg(name: ToolName, key: string, val: string) {
    setStates(prev => ({
      ...prev,
      [name]: { ...prev[name], args: { ...prev[name].args, [key]: val } },
    }));
  }

  async function runTool(name: ToolName, args: Record<string, string>) {
    update(name, { loading: true, result: null, error: null });
    try {
      const apiArgs: Record<string, unknown> = { ...args };
      if (name === 'run_benchmark') {
        apiArgs.prompts = (args.prompts ?? '').split('\n').map(s => s.trim()).filter(Boolean);
      }
      const res  = await fetch('/api/mcp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: name, args: apiArgs }),
      });
      const data = await res.json();
      if (data.error) update(name, { loading: false, error: data.error });
      else            update(name, { loading: false, result: data.result });
    } catch (e) {
      update(name, { loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const desktopConfig = `{
  "mcpServers": {
    "evalify": {
      "command": "/path/to/evalify/mcp-server/.venv/bin/python3",
      "args": ["/path/to/evalify/mcp-server/server.py"]
    }
  }
}`;

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="glass-dark rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-2xl gradient-text mb-2">🔌 MCP Server</h2>
            <p className="text-sm max-w-2xl" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Evalify exposes its evaluation capabilities as an{' '}
              <span style={{ color: '#c9d1d9' }}>MCP (Model Context Protocol)</span> server —
              the open standard that lets AI agents call tools programmatically.
              Claude, GPT, and any MCP-compatible agent can run these 5 tools directly.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-[11px] px-3 py-1 rounded-full font-mono" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}>
              5 tools
            </span>
            <span className="text-[11px] px-3 py-1 rounded-full font-mono" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
              SSE / stdio
            </span>
            <span className="text-[11px] px-3 py-1 rounded-full font-mono" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              Python · mcp SDK
            </span>
          </div>
        </div>

        {/* How it works — 3 steps */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: '🤖', title: '① Agent calls a tool', desc: 'Claude decides it needs to evaluate something and sends a message to Evalify' },
            { icon: '⚙️', title: '② Evalify runs it', desc: 'The MCP server calls the LLM APIs and runs the evaluation' },
            { icon: '📤', title: '③ Result goes back', desc: 'Scores and reasoning are returned to Claude, who uses them in its reply' },
          ].map(step => (
            <div key={step.title} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-lg mb-1">{step.icon}</div>
              <div className="text-xs font-semibold mb-0.5" style={{ color: '#e2e8f0' }}>{step.title}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{step.desc}</div>
            </div>
          ))}
        </div>

        {/* Collapsible plain-English explainer */}
        <div className="mt-4">
          <button
            onClick={() => setExplainerOpen(o => !o)}
            className="flex items-center gap-2 text-xs font-semibold transition-all"
            style={{ color: '#818cf8' }}
          >
            <span style={{ fontSize: 14 }}>{explainerOpen ? '▾' : '▸'}</span>
            {explainerOpen ? 'Hide explanation' : '💡 What is MCP? Explain like I\'m 5'}
          </button>

          {explainerOpen && (
            <div className="mt-3 rounded-xl p-5 space-y-4"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>

              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#c7d2fe' }}>🏪 Think of Evalify as a vending machine</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  Normally, <strong style={{ color: '#e2e8f0' }}>you</strong> walk up to the machine and press buttons — type a prompt, click Run, read the score.
                  <br />
                  <strong style={{ color: '#e2e8f0' }}>MCP</strong> is like adding a robot arm that can press those same buttons automatically.
                  The robot arm is an AI agent like Claude. Instead of you asking "score this response", Claude asks on your behalf — and uses the result in its own answer.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#c7d2fe' }}>🔌 What does "MCP server" mean?</p>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  MCP (Model Context Protocol) is an open standard — like USB, but for AI tools.
                  Just as any USB device works with any computer, an MCP server lets <strong style={{ color: '#e2e8f0' }}>any AI agent</strong> use Evalify's tools
                  without custom code per agent. Claude, GPT, or any future agent just reads the tool schema and knows what to call.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#c7d2fe' }}>👀 What are you seeing on this page?</p>
                <div className="text-[13px] leading-relaxed space-y-1" style={{ color: 'var(--text-muted)' }}>
                  <p>Each card below is one <strong style={{ color: '#e2e8f0' }}>MCP tool</strong> — one button on the vending machine.</p>
                  <p><strong style={{ color: '#e2e8f0' }}>{"{ } Schema"}</strong> — the instruction manual Claude reads to understand the tool.</p>
                  <p><strong style={{ color: '#e2e8f0' }}>{"▶ Try"}</strong> — a form so you can call the tool exactly the same way Claude would.</p>
                  <p>After you run a tool, you'll see the <strong style={{ color: '#818cf8' }}>MCP Request</strong> (what Claude sends) and the <strong style={{ color: '#10b981' }}>MCP Response</strong> (what Claude receives).</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Tool cards ────────────────────────────────────────── */}
      <div className="space-y-4">
        {TOOLS.map(tool => {
          const s = states[tool.name];
          return (
            <div key={tool.name} className="glass-dark rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${tool.border}` }}>

              {/* Card header */}
              <div className="flex items-start gap-3 p-4" style={{ background: tool.bg }}>
                <span className="text-2xl mt-0.5">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm" style={{ color: tool.color }}>{tool.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                      style={{ background: 'rgba(0,0,0,0.3)', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
                      mcp tool
                    </span>
                  </div>
                  {/* Plain-English description */}
                  <p className="text-sm mt-1 font-medium" style={{ color: '#e2e8f0' }}>{'plain' in tool ? tool.plain : ''}</p>
                  {/* Technical description */}
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{tool.description}</p>
                </div>
                {/* View toggle */}
                <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  {(['schema', 'try'] as const).map(v => (
                    <button key={v} onClick={() => update(tool.name, { view: v })}
                      className="text-[11px] px-3 py-1.5 transition-all"
                      style={s.view === v
                        ? { background: tool.color, color: '#fff', fontWeight: 700 }
                        : { background: 'rgba(255,255,255,0.04)', color: '#888' }}>
                      {v === 'schema' ? '{ }' : '▶ Try'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card body */}
              <div className="p-4">
                {s.view === 'schema' ? (
                  <CodeBlock label="MCP Tool Schema" content={tool.schema} color={tool.color} />
                ) : (
                  <div>
                    <ToolForm tool={tool} state={s} onChange={(k, v) => setArg(tool.name, k, v)} />

                    <button
                      onClick={() => runTool(tool.name, s.args)}
                      disabled={s.loading}
                      className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: s.loading ? 'rgba(255,255,255,0.06)' : tool.color,
                        color: s.loading ? '#666' : '#fff',
                        cursor: s.loading ? 'not-allowed' : 'pointer',
                        border: 'none',
                      }}>
                      {s.loading ? '⏳ Running…' : `▶ Run ${tool.label}`}
                    </button>

                    {(s.result !== null || s.error) && (
                      <div className="mt-4 space-y-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          <div>
                            <CodeBlock
                              label="📤 MCP Request — what Claude automatically sends"
                              content={buildMcpCall(tool.name, s.args)}
                              color="#888"
                            />
                            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                              This is the exact JSON-RPC message an AI agent sends when it calls this tool.
                              You filled in a form above — Claude would generate this automatically from context.
                            </p>
                          </div>
                          {s.error
                            ? <div className="mt-3">
                                <span className="text-[10px] font-mono font-semibold" style={{ color: '#ef4444' }}>ERROR</span>
                                <pre className="text-[11px] rounded-lg p-3 mt-1 font-mono" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
                                  {s.error}
                                </pre>
                              </div>
                            : <div>
                                <CodeBlock
                                  label="📥 MCP Response — what Claude reads back"
                                  content={prettyJSON(s.result)}
                                  color={tool.color}
                                />
                                <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                                  This JSON lands inside Claude's context. Claude reads the scores and reasoning,
                                  then uses them to answer your question — you never see this raw data unless you ask.
                                </p>
                              </div>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Connect section ────────────────────────────────────── */}
      <div className="glass-dark rounded-2xl p-6">
        <h3 className="font-display font-bold text-lg gradient-text mb-1">Connect an AI Agent</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Add Evalify to Claude Desktop or any MCP-compatible agent in two steps.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Step 1 */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: '#818cf8' }}>① Start the MCP server</div>
            <CodeBlock label="terminal" content={`cd evalify/mcp-server\npython server.py\n# or with SSE/HTTP:\npython server.py --sse`} color="#818cf8" />
          </div>

          {/* Step 2 */}
          <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: '#10b981' }}>② Add to Claude Desktop config</div>
            <CodeBlock label="~/Library/Application Support/Claude/claude_desktop_config.json" content={desktopConfig} color="#10b981" />
          </div>
        </div>

        <p className="text-[11px] mt-4" style={{ color: 'var(--text-muted)' }}>
          After restarting Claude Desktop, Evalify's 5 tools appear automatically. You can ask Claude:
          <em style={{ color: '#c9d1d9' }}> "Use run_evaluation to score this response…"</em>
        </p>
      </div>

    </div>
  );
}
