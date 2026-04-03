// lib/evalify-utils.ts
// Pure utility functions extracted for testability.
// Import these in route.ts and test them in isolation.

// ── extractNestedContent ─────────────────────────────────────
// Unwraps the double-encoded response format from internal LLM servers:
//   content = '{"response": "{\"model_output\": \"real text\"}", ...}'
export function extractNestedContent(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw ?? '';
  if (!raw.trim().startsWith('{')) return raw;

  try {
    const outer = JSON.parse(raw);

    if (outer.response && typeof outer.response === 'string') {
      try {
        const inner = JSON.parse(outer.response);
        if (inner.model_output && typeof inner.model_output === 'string') {
          return inner.model_output;
        }
        return outer.response;
      } catch {
        return outer.response;
      }
    }

    if (outer.model_output && typeof outer.model_output === 'string') {
      return outer.model_output;
    }

    for (const field of ['text', 'content', 'answer', 'output', 'result']) {
      if (outer[field] && typeof outer[field] === 'string') return outer[field];
    }
  } catch { /* not JSON */ }

  return raw;
}

// ── avg ──────────────────────────────────────────────────────
// Safe average — filters null, undefined, NaN before computing
export function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null && !isNaN(n));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ── stripV1Suffix ────────────────────────────────────────────
// KServe uses /v2/models/... — strip /v1 if user copied from custom endpoint config
export function stripV1Suffix(url: string): string {
  const trimmed = url.endsWith('/') ? url.slice(0, -1) : url;
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed;
}

// ── fillKServeTemplate ───────────────────────────────────────
// Replace {{query}} and {{timestamp}} placeholders in KServe request template
export function fillKServeTemplate(template: string, query: string, timestamp?: string): string {
  const ts = timestamp ?? Date.now().toString();
  const escapedQuery = query
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return template
    .replace(/\{\{query\}\}/g, escapedQuery)
    .replace(/\{\{timestamp\}\}/g, ts);
}

// ── sanitizeBodyFieldValue ───────────────────────────────────
// Strip accidental "Value: " prefix saved from placeholder text
export function sanitizeBodyFieldValue(value: string): string {
  return (value ?? '').replace(/^Value:\s*/i, '').trim();
}

// ── parseBodyFieldValue ──────────────────────────────────────
// Parse body field value as JSON if possible, fall back to string
export function parseBodyFieldValue(value: string): unknown {
  const clean = sanitizeBodyFieldValue(value);
  try { return JSON.parse(clean); }
  catch { return clean; }
}

// ── getProviderInfo ──────────────────────────────────────────
export type ProviderInfo = { color: string; name: string; badge: string };

export function getProviderInfo(model: string): ProviderInfo {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3'))
    return { color: 'var(--openai)', name: 'OpenAI', badge: 'badge-openai' };
  if (model.startsWith('claude'))
    return { color: 'var(--anthropic)', name: 'Anthropic', badge: 'badge-anthropic' };
  if (model.startsWith('llama') || model.startsWith('mixtral'))
    return { color: 'var(--groq)', name: 'Groq', badge: 'badge-groq' };
  if (model.startsWith('gemini'))
    return { color: 'var(--google)', name: 'Google', badge: 'badge-google' };
  return { color: 'var(--custom)', name: 'Custom', badge: 'badge-custom' };
}

// ── saveRecentQuery ──────────────────────────────────────────
export const STORAGE_KEY_QUERIES = 'evalify-recent-queries';
export const MAX_RECENT_QUERIES = 10;

export function saveRecentQuery(query: string, storage: Storage = localStorage): void {
  try {
    const raw = storage.getItem(STORAGE_KEY_QUERIES);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const updated = [query, ...existing.filter(q => q !== query)].slice(0, MAX_RECENT_QUERIES);
    storage.setItem(STORAGE_KEY_QUERIES, JSON.stringify(updated));
  } catch { /* storage unavailable */ }
}

export function loadRecentQueries(storage: Storage = localStorage): string[] {
  try {
    const raw = storage.getItem(STORAGE_KEY_QUERIES);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ── normalizePrompt ───────────────────────────────────────────
// Normalize prompt for comparison across tabs.
// Different tabs may store the same question with slight differences
// (leading/trailing whitespace, case differences) that would cause
// the strict same-question judge enforcement to incorrectly split groups.
export function normalizePrompt(prompt: string): string {
  return (prompt ?? '').trim().toLowerCase();
}

// ── isSamePrompt ─────────────────────────────────────────────
// Compare two prompts after normalization
export function isSamePrompt(a: string, b: string): boolean {
  return normalizePrompt(a) === normalizePrompt(b);
}

// ── groupByPrompt ─────────────────────────────────────────────
// Group history entries by normalized prompt.
// Returns a map of display-text → entries[]
export function groupByPrompt<T extends { question: string }>(
  entries: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.question.trim(); // preserve display text
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  return map;
}

// ── Known model names for custom judge endpoint ───────────────
// Used in the dropdown in JudgeTab when Custom Endpoint is selected
export const KNOWN_JUDGE_MODELS = [
  { value: 'llm_generic_large',    label: '🦙 llm_generic_large',    description: 'Internal — general purpose' },
  { value: 'llm_generic_large_v2', label: '🦙 llm_generic_large_v2', description: 'Internal — general purpose v2' },
  { value: 'llm_generic_small',    label: '🤏 llm_generic_small',    description: 'Internal — lightweight' },
  { value: 'gpt-4o-mini',          label: '⚡ gpt-4o-mini',          description: 'OpenAI — fast & cheap' },
  { value: 'gpt-4o',               label: '🎯 gpt-4o',               description: 'OpenAI — most accurate' },
  { value: 'claude-sonnet-4-6',    label: '🧠 claude-sonnet-4-6',    description: 'Anthropic — nuanced' },
];

export function isKnownJudgeModel(modelName: string): boolean {
  return KNOWN_JUDGE_MODELS.some(m => m.value === modelName);
}

export function getJudgeModelLabel(modelName: string): string {
  return KNOWN_JUDGE_MODELS.find(m => m.value === modelName)?.label ?? modelName;
}

// ── CSV Export logic ──────────────────────────────────────────
export interface HistoryEntry {
  id: string; timestamp: string; panel: string; question: string;
  model: string; level: string; responseTime: number | null;
  tokens: number | null; cost: number | null; score: 'up' | 'down' | null;
}

export interface JudgeHistoryEntry {
  id: string; timestamp: string; prompt: string;
  judgeModel: string; criteria: string;
  responses: { label: string; model: string }[];
  winner: string; reasoning: string;
  scores: Record<string, Record<string, number>>;
}

export function buildResponseCSV(history: HistoryEntry[]): string {
  const headers = ['Time','Panel','Question','Model','Level','Response Time (ms)','Tokens','Cost ($)','Score'];
  const rows = history.map(h => [
    h.timestamp,
    h.panel,
    `"${(h.question ?? '').replace(/"/g, '""')}"`,
    h.model,
    h.level,
    (h.responseTime != null && !isNaN(h.responseTime)) ? h.responseTime : '',
    (h.tokens != null && !isNaN(h.tokens)) ? h.tokens : '',
    (h.cost != null && !isNaN(h.cost)) ? h.cost.toFixed(5) : '',
    h.score ?? '',
  ]);
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}

export function buildJudgeCSV(judgeHistory: JudgeHistoryEntry[]): string {
  const headers = ['Time','Question','Judge Model','Criteria','Winner','Models Compared','Reasoning'];
  const rows = judgeHistory.map(j => [
    j.timestamp,
    `"${(j.prompt ?? '').replace(/"/g, '""')}"`,
    j.judgeModel,
    j.criteria || 'MT-Bench Default',
    j.winner,
    j.responses.map(r => r.model).join(' | '),
    `"${(j.reasoning ?? '').replace(/"/g, '""')}"`,
  ]);
  return [headers, ...rows].map(r => r.join(',')).join('\n');
}

// ── Panel actions logic ────────────────────────────────────────
export type ScoreValue = 'up' | 'down';

export function toggleScore(
  current: ScoreValue | null, clicked: ScoreValue
): ScoreValue | null {
  // clicking same score again → remove it (toggle off)
  return current === clicked ? null : clicked;
}

export function computeWinRate(history: HistoryEntry[], model: string): number | null {
  const modelEntries = history.filter(h => h.model === model && h.score !== null);
  if (!modelEntries.length) return null;
  const wins = modelEntries.filter(h => h.score === 'up').length;
  return Math.round((wins / modelEntries.length) * 100);
}

// ── Stats summary ─────────────────────────────────────────────
export interface ModelStats {
  model: string; count: number;
  avgTime: number | null; avgTokens: number | null; totalCost: number;
}

export function computeModelStats(history: HistoryEntry[]): ModelStats[] {
  const byModel: Record<string, HistoryEntry[]> = {};
  for (const h of history) {
    if (!byModel[h.model]) byModel[h.model] = [];
    byModel[h.model].push(h);
  }
  return Object.entries(byModel).map(([model, entries]) => ({
    model,
    count: entries.length,
    avgTime: avg(entries.map(e => e.responseTime)),
    avgTokens: avg(entries.map(e => e.tokens)),
    totalCost: entries.reduce((sum, e) => sum + ((!isNaN(e.cost ?? 0) ? (e.cost ?? 0) : 0)), 0),
  }));
}

// ── Complexity ────────────────────────────────────────────────
export const COMPLEXITY_LABELS: Record<number, string> = {
  1: '🧒 Age 5', 2: '📚 Middle School', 3: '🎓 High School',
  4: '🏫 College', 5: '🔬 Expert',
};

export const COMPLEXITY_PROMPTS: Record<number, string> = {
  1: 'Explain like I am 5 years old. Use simple words, short sentences, and fun analogies.',
  2: 'Explain like I am in middle school. Use everyday language with some basic terms.',
  3: 'Explain like I am in high school. Use some technical terms but keep it clear.',
  4: 'Explain like I am a college student. Use proper terminology and go into some depth.',
  5: 'Explain like I am an expert. Be precise, technical, and thorough.',
};

export const DEFAULT_COMPLEXITY = 1; // Age 5 — most approachable default

export function getComplexityPrompt(level: number): string {
  return COMPLEXITY_PROMPTS[level] ?? COMPLEXITY_PROMPTS[1];
}
