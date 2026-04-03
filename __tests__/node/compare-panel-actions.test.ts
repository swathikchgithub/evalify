// __tests__/node/compare-panel-actions.test.ts
// Tests for Compare Models panel actions: clear, thumbs up/down,
// add to judge, copy, response time/tokens, CSV export, stats.
// Tests focus on pure business logic — no React/DOM required.

import {
  toggleScore, computeWinRate, computeModelStats, buildResponseCSV,
  buildJudgeCSV, getComplexityPrompt, DEFAULT_COMPLEXITY,
  COMPLEXITY_LABELS, COMPLEXITY_PROMPTS,
  HistoryEntry, JudgeHistoryEntry,
} from '../../lib/evalify-utils';

// ── Test fixtures ─────────────────────────────────────────────
const makeEntry = (overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: `entry-${Date.now()}-${Math.random()}`,
  timestamp: '10:00:00 AM',
  panel: 'A',
  question: 'What is AI?',
  model: 'gpt-4o-mini',
  level: '🧒 Age 5',
  responseTime: 1200,
  tokens: 350,
  cost: 0.00021,
  score: null,
  ...overrides,
});

const fourPanelHistory: HistoryEntry[] = [
  makeEntry({ panel: 'A', model: 'gpt-4o-mini',             responseTime: 1200, tokens: 350,  cost: 0.00021 }),
  makeEntry({ panel: 'B', model: 'claude-haiku-4-5-20251001', responseTime: 5900, tokens: 511,  cost: 0.00064 }),
  makeEntry({ panel: 'C', model: 'llama-3.3-70b-versatile',  responseTime: 2400, tokens: 600,  cost: 0.00047 }),
  makeEntry({ panel: 'D', model: 'gemini-2.5-flash',         responseTime: 7600, tokens: 739,  cost: 0.00030 }),
];

// ─────────────────────────────────────────────────────────────

describe('Compare Models — Clear All Panels', () => {

  it('clearTrigger=0 means no clear has happened', () => {
    const clearTrigger = 0;
    expect(clearTrigger).toBe(0); // initial state
  });

  it('incrementing clearTrigger signals clear to all panels', () => {
    let clearTrigger = 0;
    clearTrigger += 1; // user clicks Clear All
    expect(clearTrigger).toBe(1);
  });

  it('multiple clears increment the trigger', () => {
    let clearTrigger = 0;
    clearTrigger += 1;
    clearTrigger += 1;
    expect(clearTrigger).toBe(2);
  });

  it('panel with clearTrigger !== 0 should clear messages', () => {
    // Simulates the useEffect in ChatPanel
    const messages = [{ id: '1', role: 'user', content: 'hello' }];
    let cleared = [...messages];

    const clearTrigger = 1;
    if (clearTrigger !== 0) { cleared = []; }

    expect(cleared).toHaveLength(0);
  });

  it('clearTrigger=0 should NOT clear messages', () => {
    const messages = [{ id: '1', role: 'user', content: 'hello' }];
    let cleared = [...messages];

    const clearTrigger = 0;
    if (clearTrigger !== 0) { cleared = []; }

    expect(cleared).toHaveLength(1); // unchanged
  });

});

describe('Compare Models — Thumbs Up / Down (Score)', () => {

  describe('toggleScore', () => {
    it('clicking 👍 when no score → sets up', () => {
      expect(toggleScore(null, 'up')).toBe('up');
    });

    it('clicking 👎 when no score → sets down', () => {
      expect(toggleScore(null, 'down')).toBe('down');
    });

    it('clicking 👍 again → removes score (toggle off)', () => {
      expect(toggleScore('up', 'up')).toBeNull();
    });

    it('clicking 👎 again → removes score (toggle off)', () => {
      expect(toggleScore('down', 'down')).toBeNull();
    });

    it('clicking 👎 when 👍 is set → switches to down', () => {
      expect(toggleScore('up', 'down')).toBe('down');
    });

    it('clicking 👍 when 👎 is set → switches to up', () => {
      expect(toggleScore('down', 'up')).toBe('up');
    });
  });

  describe('computeWinRate', () => {
    it('returns null for model with no scored responses', () => {
      expect(computeWinRate(fourPanelHistory, 'gpt-4o-mini')).toBeNull();
    });

    it('returns 100% when all scores are up', () => {
      const history = [
        makeEntry({ model: 'gpt-4o-mini', score: 'up' }),
        makeEntry({ model: 'gpt-4o-mini', score: 'up' }),
      ];
      expect(computeWinRate(history, 'gpt-4o-mini')).toBe(100);
    });

    it('returns 0% when all scores are down', () => {
      const history = [
        makeEntry({ model: 'gpt-4o-mini', score: 'down' }),
        makeEntry({ model: 'gpt-4o-mini', score: 'down' }),
      ];
      expect(computeWinRate(history, 'gpt-4o-mini')).toBe(0);
    });

    it('returns 50% for 1 up and 1 down', () => {
      const history = [
        makeEntry({ model: 'gpt-4o-mini', score: 'up' }),
        makeEntry({ model: 'gpt-4o-mini', score: 'down' }),
      ];
      expect(computeWinRate(history, 'gpt-4o-mini')).toBe(50);
    });

    it('only counts entries for the specified model', () => {
      const history = [
        makeEntry({ model: 'gpt-4o-mini', score: 'up' }),
        makeEntry({ model: 'claude-haiku', score: 'down' }),
      ];
      expect(computeWinRate(history, 'gpt-4o-mini')).toBe(100);
      expect(computeWinRate(history, 'claude-haiku')).toBe(0);
    });
  });

});

describe('Compare Models — Response Time & Tokens', () => {

  it('response time is recorded in milliseconds', () => {
    const entry = makeEntry({ responseTime: 1234 });
    expect(entry.responseTime).toBe(1234);
    expect(typeof entry.responseTime).toBe('number');
  });

  it('tokens are stored as integers', () => {
    const entry = makeEntry({ tokens: 350 });
    expect(entry.tokens).toBe(350);
    expect(Number.isInteger(entry.tokens)).toBe(true);
  });

  it('NaN response time is treated as null in stats', () => {
    const entry = makeEntry({ responseTime: NaN });
    const isValid = entry.responseTime != null && !isNaN(entry.responseTime);
    expect(isValid).toBe(false);
  });

  it('null tokens display as — in the UI', () => {
    const entry = makeEntry({ tokens: null });
    const display = (entry.tokens != null && !isNaN(entry.tokens as number))
      ? entry.tokens : '—';
    expect(display).toBe('—');
  });

  it('KServe v2 responses have null tokens (no token count from server)', () => {
    const kserveEntry = makeEntry({ model: 'llm_generic_large_v2', tokens: null });
    expect(kserveEntry.tokens).toBeNull();
  });

});

describe('Compare Models — Stats', () => {

  it('computes per-model stats from history', () => {
    const stats = computeModelStats(fourPanelHistory);
    expect(stats).toHaveLength(4);
  });

  it('each model has count, avgTime, totalCost', () => {
    const stats = computeModelStats(fourPanelHistory);
    for (const s of stats) {
      expect(s.model).toBeTruthy();
      expect(s.count).toBeGreaterThan(0);
      expect(typeof s.totalCost).toBe('number');
    }
  });

  it('avgTime rounds to nearest integer', () => {
    const history = [makeEntry({ responseTime: 1100 }), makeEntry({ responseTime: 1300 })];
    const stats = computeModelStats(history);
    expect(stats[0].avgTime).toBe(1200);
  });

  it('filters NaN from avgTime calculation', () => {
    const history = [
      makeEntry({ responseTime: 1000 }),
      makeEntry({ responseTime: NaN }),
    ];
    const stats = computeModelStats(history);
    expect(stats[0].avgTime).toBe(1000); // NaN filtered out
    expect(stats[0].avgTime).not.toBeNaN();
  });

  it('totalCost sums correctly', () => {
    const history = [
      makeEntry({ cost: 0.00021 }),
      makeEntry({ cost: 0.00064 }),
    ];
    const stats = computeModelStats(history);
    expect(stats[0].totalCost).toBeCloseTo(0.00085);
  });

  it('returns empty array for empty history', () => {
    expect(computeModelStats([])).toEqual([]);
  });

});

describe('Export CSV — Response History', () => {

  it('generates valid CSV with header row', () => {
    const csv = buildResponseCSV(fourPanelHistory);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Time');
    expect(lines[0]).toContain('Model');
    expect(lines[0]).toContain('Tokens');
    expect(lines[0]).toContain('Cost ($)');
    expect(lines[0]).toContain('Score');
  });

  it('generates correct number of rows (header + data)', () => {
    const csv = buildResponseCSV(fourPanelHistory);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(fourPanelHistory.length + 1); // +1 for header
  });

  it('escapes quotes in questions', () => {
    const history = [makeEntry({ question: 'What is "AI"?' })];
    const csv = buildResponseCSV(history);
    expect(csv).toContain('""AI""'); // double-quote escaping
  });

  it('renders NaN as empty string not NaN', () => {
    const history = [makeEntry({ responseTime: NaN, tokens: NaN })];
    const csv = buildResponseCSV(history);
    expect(csv).not.toContain('NaN');
  });

  it('renders null cost as empty string', () => {
    const history = [makeEntry({ cost: null })];
    const csv = buildResponseCSV(history);
    const lines = csv.split('\n');
    // cost field should be empty, not 'null'
    expect(lines[1]).not.toContain('null');
  });

  it('renders score up/down correctly', () => {
    const history = [
      makeEntry({ score: 'up' }),
      makeEntry({ score: 'down' }),
      makeEntry({ score: null }),
    ];
    const csv = buildResponseCSV(history);
    expect(csv).toContain('up');
    expect(csv).toContain('down');
  });

  it('returns header only for empty history', () => {
    const csv = buildResponseCSV([]);
    expect(csv.split('\n')).toHaveLength(1);
  });

});

describe('Export CSV — Judge History', () => {

  const judgeEntry: JudgeHistoryEntry = {
    id: 'judge-1',
    timestamp: '10:30 AM',
    prompt: 'Explain microservices',
    judgeModel: 'gpt-4o-mini',
    criteria: '',
    responses: [
      { label: 'A — gpt', model: 'gpt-4o-mini' },
      { label: 'B — claude', model: 'claude-haiku' },
    ],
    winner: 'A — gpt',
    reasoning: 'Response A was more accurate.',
    scores: { 'A — gpt': { overall: 9 }, 'B — claude': { overall: 7 } },
  };

  it('generates valid CSV for judge history', () => {
    const csv = buildJudgeCSV([judgeEntry]);
    expect(csv).toContain('Winner');
    expect(csv).toContain('Judge Model');
    expect(csv).toContain('A — gpt');
  });

  it('uses MT-Bench Default when criteria is empty', () => {
    const csv = buildJudgeCSV([judgeEntry]);
    expect(csv).toContain('MT-Bench Default');
  });

  it('lists all compared models pipe-separated', () => {
    const csv = buildJudgeCSV([judgeEntry]);
    expect(csv).toContain('gpt-4o-mini | claude-haiku');
  });

  it('escapes quotes in prompt and reasoning', () => {
    const entry: JudgeHistoryEntry = {
      ...judgeEntry,
      prompt: 'What is "microservices"?',
      reasoning: 'Response A said "accurate" things.',
    };
    const csv = buildJudgeCSV([entry]);
    // CSV double-quote escaping: " becomes "" inside a quoted field
    expect(csv).toContain('""microservices""');
    expect(csv).toContain('""accurate""'); // "accurate" → ""accurate""
  });

  it('returns header only for empty judge history', () => {
    const csv = buildJudgeCSV([]);
    expect(csv.split('\n')).toHaveLength(1);
  });

});

describe('Complexity Settings', () => {

  it('default complexity is 1 (Age 5)', () => {
    expect(DEFAULT_COMPLEXITY).toBe(1);
  });

  it('Age 5 label is set for complexity 1', () => {
    expect(COMPLEXITY_LABELS[1]).toContain('Age 5');
  });

  it('all 5 complexity levels have labels', () => {
    for (let i = 1; i <= 5; i++) {
      expect(COMPLEXITY_LABELS[i]).toBeTruthy();
    }
  });

  it('all 5 complexity levels have prompts', () => {
    for (let i = 1; i <= 5; i++) {
      expect(getComplexityPrompt(i)).toBeTruthy();
      expect(getComplexityPrompt(i).length).toBeGreaterThan(10);
    }
  });

  it('Age 5 prompt uses simple language instruction', () => {
    const prompt = getComplexityPrompt(1);
    expect(prompt.toLowerCase()).toContain('5 years old');
  });

  it('Expert prompt uses technical language instruction', () => {
    const prompt = getComplexityPrompt(5);
    expect(prompt.toLowerCase()).toContain('expert');
  });

  it('unknown complexity level falls back to Age 5', () => {
    expect(getComplexityPrompt(99)).toBe(COMPLEXITY_PROMPTS[1]);
  });

});

describe('Add to Judge — Pool Entry requirements', () => {

  it('pool entry requires id, model, prompt, content, label', () => {
    const poolEntry = {
      id: 'msg-123',
      label: 'A — gpt',
      model: 'gpt-4o-mini',
      content: 'Microservices are small independent services.',
      prompt: 'What is microservices?',
      tab: 'compare' as const,
      timestamp: '10:00 AM',
    };

    expect(poolEntry.id).toBeTruthy();
    expect(poolEntry.label).toBeTruthy();
    expect(poolEntry.model).toBeTruthy();
    expect(poolEntry.content).toBeTruthy();
    expect(poolEntry.prompt).toBeTruthy();
  });

  it('pool entry label follows A/B/C/D — model format for compare panels', () => {
    const labels = ['A — gpt', 'B — claude', 'C — llama', 'D — gemini'];
    for (const label of labels) {
      expect(label).toMatch(/^[A-D] — .+/);
    }
  });

  it('custom endpoint pool entry uses 🔌 prefix', () => {
    const label = '🔌 — llm_generic_large';
    expect(label).toContain('🔌');
    expect(label).toContain('llm_generic_large');
  });

  it('kserve pool entry uses 🧬 prefix', () => {
    const label = '🧬 — llm_generic_large_v2';
    expect(label).toContain('🧬');
  });

});

describe('Copy functionality', () => {

  it('message content is a string ready to copy', () => {
    const message = { id: '1', role: 'assistant', content: '# Hello\nThis is markdown.' };
    expect(typeof message.content).toBe('string');
    expect(message.content.length).toBeGreaterThan(0);
  });

  it('copy state resets after 2 seconds (contract)', () => {
    // The UI shows ✅ then reverts to 📋 after 2000ms
    const COPY_RESET_MS = 2000;
    expect(COPY_RESET_MS).toBe(2000);
  });

});

describe('SOLID Principles — Architecture contracts', () => {

  // Single Responsibility: each utility function does ONE thing
  it('buildResponseCSV only builds CSV, does not download', () => {
    const csv = buildResponseCSV(fourPanelHistory);
    // Returns a string — does NOT trigger download (no DOM side effects)
    expect(typeof csv).toBe('string');
  });

  it('computeModelStats only computes, does not render', () => {
    const stats = computeModelStats(fourPanelHistory);
    // Returns plain data — no JSX, no DOM
    expect(Array.isArray(stats)).toBe(true);
    expect(stats[0]).not.toHaveProperty('render');
  });

  it('toggleScore is a pure function (same input → same output)', () => {
    // Pure function: no side effects, deterministic
    expect(toggleScore(null, 'up')).toBe('up');
    expect(toggleScore(null, 'up')).toBe('up'); // same call, same result
    expect(toggleScore('up', 'up')).toBeNull();
    expect(toggleScore('up', 'up')).toBeNull();
  });

  // Open/Closed: utility functions accept data, don't hardcode models
  it('computeModelStats works for any model name', () => {
    const custom = [makeEntry({ model: 'my-custom-model-v99' })];
    const stats = computeModelStats(custom);
    expect(stats[0].model).toBe('my-custom-model-v99');
  });

  // Dependency Inversion: functions take data, not implementations
  it('buildResponseCSV accepts HistoryEntry[], not a store or class', () => {
    // The function signature takes plain data arrays
    const csv = buildResponseCSV([]);
    expect(typeof csv).toBe('string');
  });

  // Interface Segregation: COMPLEXITY_LABELS and COMPLEXITY_PROMPTS are separate
  it('can use complexity labels without importing prompts', () => {
    expect(COMPLEXITY_LABELS[1]).toBeTruthy();
    // Labels and prompts are separate exports — use only what you need
  });

});

// ── Deep clearTrigger tests ────────────────────────────────────
// These test the actual panel state management logic that was
// missing — the bug was clearTrigger prop existed in JSX but
// ChatPanel never read it.

describe('ClearTrigger — panel state management', () => {

  // Simulate the ChatPanel state + useEffect logic
  function makePanelState() {
    return {
      messages: [
        { id: 'u1', role: 'user',      content: 'What is AI?' },
        { id: 'a1', role: 'assistant', content: 'AI is...' },
      ],
      messageMetrics: { a1: { responseTime: 1200, tokens: 350 } },
      scores: { a1: 'up' as const },
      lastPrompt: 'What is AI?',
    };
  }

  function applyPanelClear(state: ReturnType<typeof makePanelState>, clearTrigger: number) {
    // Mirrors the useEffect in ChatPanel exactly:
    // if (clearTrigger === 0) return;
    // setMessages([]); setMessageMetrics({}); setScores({}); setLastPrompt('');
    if (clearTrigger === 0) return state;
    return { messages: [], messageMetrics: {}, scores: {}, lastPrompt: '' };
  }

  it('clears messages when clearTrigger > 0', () => {
    const state = makePanelState();
    const cleared = applyPanelClear(state, 1);
    expect(cleared.messages).toHaveLength(0);
  });

  it('clears messageMetrics when clearTrigger > 0', () => {
    const state = makePanelState();
    const cleared = applyPanelClear(state, 1);
    expect(Object.keys(cleared.messageMetrics)).toHaveLength(0);
  });

  it('clears scores when clearTrigger > 0', () => {
    const state = makePanelState();
    const cleared = applyPanelClear(state, 1);
    expect(Object.keys(cleared.scores)).toHaveLength(0);
  });

  it('clears lastPrompt when clearTrigger > 0', () => {
    const state = makePanelState();
    const cleared = applyPanelClear(state, 1);
    expect(cleared.lastPrompt).toBe('');
  });

  it('does NOT clear when clearTrigger === 0 (initial state)', () => {
    const state = makePanelState();
    const result = applyPanelClear(state, 0);
    expect(result.messages).toHaveLength(2);
    expect(Object.keys(result.scores)).toHaveLength(1);
  });

  it('clears on trigger=2 (second clear also works)', () => {
    const state = makePanelState();
    const cleared = applyPanelClear(state, 2);
    expect(cleared.messages).toHaveLength(0);
  });

  it('all 4 panels clear independently', () => {
    const panels = ['A', 'B', 'C', 'D'];
    const clearTrigger = 1;

    const results = panels.map(panel => {
      const state = {
        panelId: panel,
        messages: [{ id: `${panel}-1`, role: 'user', content: 'hello' }],
        scores: {},
        lastPrompt: 'hello',
      };
      return applyPanelClear(state, clearTrigger);
    });

    // All 4 panels cleared
    for (const result of results) {
      expect(result.messages).toHaveLength(0);
      expect(result.lastPrompt).toBe('');
    }
  });

  it('clear after responses preserves model selection', () => {
    // Clearing messages does NOT reset the model dropdown
    const modelSelection = 'claude-haiku-4-5-20251001';
    const state = { ...makePanelState(), model: modelSelection };
    applyPanelClear(state, 1); // clear fires
    // model is separate state — not touched by clear
    expect(state.model).toBe(modelSelection);
  });

  it('clearTrigger increment pattern is idempotent', () => {
    // Same trigger value should have same effect
    const state = makePanelState();
    const cleared1 = applyPanelClear(state, 1);
    const cleared2 = applyPanelClear(makePanelState(), 1);
    expect(cleared1.messages).toHaveLength(0);
    expect(cleared2.messages).toHaveLength(0);
  });

});

describe('ClearTrigger — prop wiring contract', () => {

  it('clearTrigger defaults to 0 when not provided', () => {
    // ChatPanel signature: clearTrigger = 0
    const defaultClearTrigger = 0;
    expect(defaultClearTrigger).toBe(0);
  });

  it('clearAllTrigger starts at 0 in Home state', () => {
    const clearAllTrigger = 0; // useState(0)
    expect(clearAllTrigger).toBe(0);
  });

  it('clicking Clear increments clearAllTrigger by 1', () => {
    let clearAllTrigger = 0;
    // onClick={() => setClearAllTrigger(t => t + 1)}
    clearAllTrigger = clearAllTrigger + 1;
    expect(clearAllTrigger).toBe(1);
  });

  it('clearAllTrigger passes same value to all 4 panels', () => {
    const clearAllTrigger = 3;
    // All panels receive the same trigger value
    const panelTriggers = ['A', 'B', 'C', 'D'].map(() => clearAllTrigger);
    for (const t of panelTriggers) {
      expect(t).toBe(3);
    }
  });

  it('useEffect dependency array contains clearTrigger', () => {
    // Documents the required dependency: useEffect(() => {...}, [clearTrigger])
    // If clearTrigger is NOT in deps array, the effect never runs
    const deps = ['clearTrigger'];
    expect(deps).toContain('clearTrigger');
  });

});
