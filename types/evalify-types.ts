// types/evalify.ts
// Single Responsibility: one file owns all shared TypeScript types.
// Import from here instead of defining inline in page.tsx.

// ── Model & Provider ──────────────────────────────────────────
export type ModelStatus = 'untested' | 'online' | 'error';

export interface ProviderInfo {
  color: string;
  name: string;
  badge: string;
}

// ── Metrics & History ─────────────────────────────────────────
export interface PanelMetrics {
  responseTime: number | null;
  tokens: number | null;
  level: string;
  model: string;
}

export interface HistoryEntry {
  id: string;
  question: string;
  panel: string;
  model: string;
  level: string;
  responseTime: number | null;
  tokens: number | null;
  cost: number | null;
  score: 'up' | 'down' | null;
  timestamp: string;
}

// ── Config & Storage ──────────────────────────────────────────
export interface KeyValuePair {
  key: string;
  value: string;
}

export interface SavedConfig {
  id: string;
  name: string;
  endpointUrl: string;
  endpointApiKey: string;
  endpointModel: string;
  authType: string;
  skipSsl: boolean;
  headers: KeyValuePair[];
  bodyFields: KeyValuePair[];
  createdAt: string;
}

// ── Judge Pool ────────────────────────────────────────────────
export interface PoolEntry {
  id: string;
  label: string;
  model: string;
  content: string;
  prompt: string;
  tab: 'compare' | 'openai' | 'kserve' | 'history';
  timestamp: string;
}

// ── Judge Results ─────────────────────────────────────────────
export interface JudgeResult {
  id: string;
  timestamp: string;
  prompt: string;
  judgeModel: string;
  criteria: string;
  responses: { label: string; model: string }[];
  winner: string;
  reasoning: string;
  scores: Record<string, Record<string, number>>;
}

// ── Tab Navigation ────────────────────────────────────────────
export type ActiveTab = 'compare' | 'openai' | 'kserve' | 'judge' | 'stats';
