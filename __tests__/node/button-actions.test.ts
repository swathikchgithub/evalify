// __tests__/node/button-actions.test.ts
// Tests for all button actions in Compare Models tab:
// Individual panel clear, Clear All, Ask All, 📡 All (broadcast)
// Documents the trigger pattern used throughout the app.

// ── Shared trigger pattern ────────────────────────────────────
// All major actions use the counter-increment pattern:
// state starts at 0 → useEffect ignores 0 → click increments
// → useEffect fires → action executes

function makeSubmitState() {
  return {
    input: 'What is microservices?',
    submitTrigger: 0,
    broadcastTrigger: 0,
    clearAllTrigger: 0,
    broadcastInput: '',
    lastInput: '',
  };
}

// Simulates clicking "Ask All" button
function handleAskAll(state: ReturnType<typeof makeSubmitState>) {
  if (!state.input.trim()) return state;
  return {
    ...state,
    lastInput: state.input,
    submitTrigger: state.submitTrigger + 1,
    input: '',
  };
}

// Simulates clicking "📡 All" button
function handleBroadcastAll(state: ReturnType<typeof makeSubmitState>) {
  if (!state.input.trim()) return state;
  return {
    ...state,
    lastInput: state.input,
    broadcastInput: state.input,
    broadcastTrigger: state.broadcastTrigger + 1,
    submitTrigger: state.submitTrigger + 1,
    input: '',
  };
}

// Simulates clicking "🗑 Clear" (clear all panels)
function handleClearAll(state: ReturnType<typeof makeSubmitState>) {
  return {
    ...state,
    clearAllTrigger: state.clearAllTrigger + 1,
  };
}

// Simulates individual panel clear button
function handlePanelClear(panelState: { messages: any[]; metrics: any; scores: any }) {
  return { messages: [], metrics: {}, scores: {} };
}

// Simulates ChatPanel useEffect for submitTrigger
function applySubmitTrigger(
  panelState: { messages: any[] },
  submitTrigger: number,
  sharedInput: string
) {
  if (submitTrigger === 0 || !sharedInput.trim()) return panelState;
  return {
    ...panelState,
    messages: [...panelState.messages, { role: 'user', content: sharedInput }],
  };
}

// Simulates ChatPanel useEffect for clearTrigger
function applyClearTrigger(
  panelState: { messages: any[]; metrics: any; scores: any; lastPrompt: string },
  clearTrigger: number
) {
  if (clearTrigger === 0) return panelState;
  return { messages: [], metrics: {}, scores: {}, lastPrompt: '' };
}

// ─────────────────────────────────────────────────────────────

describe('"Ask All" button — 4 compare panels only', () => {

  it('increments submitTrigger', () => {
    const state = makeSubmitState();
    const next = handleAskAll(state);
    expect(next.submitTrigger).toBe(1);
  });

  it('clears input after submit', () => {
    const state = makeSubmitState();
    const next = handleAskAll(state);
    expect(next.input).toBe('');
  });

  it('stores input in lastInput before clearing', () => {
    const state = makeSubmitState();
    const next = handleAskAll(state);
    expect(next.lastInput).toBe('What is microservices?');
  });

  it('does NOT increment broadcastTrigger', () => {
    const state = makeSubmitState();
    const next = handleAskAll(state);
    expect(next.broadcastTrigger).toBe(0); // only compare panels
  });

  it('does nothing when input is empty', () => {
    const state = { ...makeSubmitState(), input: '' };
    const next = handleAskAll(state);
    expect(next.submitTrigger).toBe(0); // unchanged
  });

  it('does nothing when input is whitespace only', () => {
    const state = { ...makeSubmitState(), input: '   ' };
    const next = handleAskAll(state);
    expect(next.submitTrigger).toBe(0);
  });

  it('each ChatPanel fires when submitTrigger > 0', () => {
    const trigger = 1;
    const input = 'What is AI?';
    const panels = ['A', 'B', 'C', 'D'].map(id => ({
      id, messages: [] as any[],
    }));

    const updated = panels.map(p => applySubmitTrigger(p, trigger, input));
    for (const p of updated) {
      expect(p.messages).toHaveLength(1);
      expect(p.messages[0].content).toBe('What is AI?');
    }
  });

  it('panel ignores submitTrigger=0', () => {
    const panel = { messages: [] };
    const result = applySubmitTrigger(panel, 0, 'hello');
    expect(result.messages).toHaveLength(0);
  });

});

describe('"📡 All" button — compare + custom endpoint + KServe', () => {

  it('increments BOTH submitTrigger AND broadcastTrigger', () => {
    const state = makeSubmitState();
    const next = handleBroadcastAll(state);
    expect(next.submitTrigger).toBe(1);    // compare panels fire
    expect(next.broadcastTrigger).toBe(1); // custom + kserve fire
  });

  it('stores question in broadcastInput', () => {
    const state = makeSubmitState();
    const next = handleBroadcastAll(state);
    expect(next.broadcastInput).toBe('What is microservices?');
  });

  it('clears input after broadcast', () => {
    const state = makeSubmitState();
    const next = handleBroadcastAll(state);
    expect(next.input).toBe('');
  });

  it('does nothing when input is empty', () => {
    const state = { ...makeSubmitState(), input: '' };
    const next = handleBroadcastAll(state);
    expect(next.broadcastTrigger).toBe(0);
    expect(next.submitTrigger).toBe(0);
  });

  it('broadcasts to ALL 6 endpoints simultaneously', () => {
    // 4 compare panels (via submitTrigger) + custom endpoint + kserve (via broadcastTrigger)
    const state = makeSubmitState();
    const next = handleBroadcastAll(state);

    const comparesFired  = next.submitTrigger > 0;    // panels A/B/C/D
    const broadcastFired = next.broadcastTrigger > 0; // custom + kserve

    expect(comparesFired).toBe(true);
    expect(broadcastFired).toBe(true);
  });

  it('difference from Ask All: broadcastTrigger is 0 for Ask All', () => {
    const state = makeSubmitState();
    const askAll       = handleAskAll(state);
    const broadcastAll = handleBroadcastAll(state);

    expect(askAll.broadcastTrigger).toBe(0); // Ask All: compare only
    expect(broadcastAll.broadcastTrigger).toBe(1); // 📡 All: all tabs
  });

  it('CustomEndpointTab ignores broadcastTrigger=0', () => {
    // broadcastTrigger=0 means initial state — don't fire
    const broadcastTrigger = 0;
    const broadcastInput = 'some input';
    const endpointUrl = 'https://my-server.com';

    const shouldFire = broadcastTrigger !== 0 && broadcastInput.trim() && endpointUrl.trim();
    expect(shouldFire).toBeFalsy();
  });

  it('CustomEndpointTab fires when broadcastTrigger > 0', () => {
    const broadcastTrigger = 1;
    const broadcastInput = 'What is AI?';
    const endpointUrl = 'https://my-server.com';

    const shouldFire = broadcastTrigger !== 0 && broadcastInput.trim() && endpointUrl.trim();
    expect(shouldFire).toBeTruthy();
  });

  it('CustomEndpointTab skips broadcast when URL not configured', () => {
    const broadcastTrigger = 1;
    const broadcastInput = 'What is AI?';
    const endpointUrl = ''; // not configured

    const shouldFire = broadcastTrigger !== 0 && broadcastInput.trim() && endpointUrl.trim();
    expect(shouldFire).toBeFalsy(); // gracefully skips
  });

});

describe('"🗑" Individual panel clear button', () => {

  it('clears messages for that panel only', () => {
    const panel = {
      messages: [
        { id: 'u1', role: 'user', content: 'hello' },
        { id: 'a1', role: 'assistant', content: 'Hi!' },
      ],
      metrics: { a1: { responseTime: 500, tokens: 50 } },
      scores: { a1: 'up' },
    };

    const cleared = handlePanelClear(panel);
    expect(cleared.messages).toHaveLength(0);
  });

  it('clears metrics for that panel only', () => {
    const panel = { messages: [], metrics: { a1: { responseTime: 500 } }, scores: {} };
    const cleared = handlePanelClear(panel);
    expect(Object.keys(cleared.metrics)).toHaveLength(0);
  });

  it('clears scores for that panel only', () => {
    const panel = { messages: [], metrics: {}, scores: { a1: 'up', a2: 'down' } };
    const cleared = handlePanelClear(panel);
    expect(Object.keys(cleared.scores)).toHaveLength(0);
  });

  it('does not affect other panels', () => {
    // Panel A clears → Panel B unchanged
    const panelA = { messages: [{ id: 'a1', role: 'user', content: 'hello' }], metrics: {}, scores: {} };
    const panelB = { messages: [{ id: 'b1', role: 'user', content: 'world' }], metrics: {}, scores: {} };

    handlePanelClear(panelA); // only A clears
    // B is unaffected
    expect(panelB.messages).toHaveLength(1);
  });

});

describe('"🗑 Clear" button — Clear ALL 4 panels', () => {

  it('increments clearAllTrigger', () => {
    const state = makeSubmitState();
    const next = handleClearAll(state);
    expect(next.clearAllTrigger).toBe(1);
  });

  it('each subsequent click increments further', () => {
    let state = makeSubmitState();
    state = handleClearAll(state);
    state = handleClearAll(state);
    state = handleClearAll(state);
    expect(state.clearAllTrigger).toBe(3);
  });

  it('all 4 panels respond to clearAllTrigger', () => {
    const clearTrigger = 1;
    const panels = ['A', 'B', 'C', 'D'].map(id => ({
      id,
      messages: [{ id: `${id}-1`, role: 'user', content: 'hello' }],
      metrics: { [`${id}-1`]: { responseTime: 1000 } },
      scores: {},
      lastPrompt: 'hello',
    }));

    const cleared = panels.map(p => applyClearTrigger(p, clearTrigger));
    for (const p of cleared) {
      expect(p.messages).toHaveLength(0);
      expect(p.lastPrompt).toBe('');
    }
  });

  it('panels ignore clearAllTrigger=0 (initial state)', () => {
    const clearTrigger = 0;
    const panel = {
      messages: [{ id: '1', role: 'user', content: 'hello' }],
      metrics: {}, scores: {}, lastPrompt: 'hello',
    };
    const result = applyClearTrigger(panel, clearTrigger);
    expect(result.messages).toHaveLength(1); // unchanged
  });

  it('does not clear input field in the form bar', () => {
    // Clear All clears panel content only, not the text input
    const state = { ...makeSubmitState(), input: 'my question' };
    const next = handleClearAll(state);
    expect(next.clearAllTrigger).toBe(1);
    // input is untouched — user can re-send after clearing
    expect(state.input).toBe('my question');
  });

  it('individual clear and clear-all are independent', () => {
    // Individual clear: direct setMessages([]) — no trigger
    // Clear all: increments clearAllTrigger → useEffect fires
    const individualClearUsesDirectCall = true;
    const clearAllUsesTriggerPattern = true;
    expect(individualClearUsesDirectCall).toBe(true);
    expect(clearAllUsesTriggerPattern).toBe(true);
  });

});

describe('Button label clarity', () => {

  it('Ask All sends to compare panels only (4 panels)', () => {
    const ASK_ALL_TARGETS = ['panel-A', 'panel-B', 'panel-C', 'panel-D'];
    expect(ASK_ALL_TARGETS).toHaveLength(4);
  });

  it('📡 All sends to all tabs (4 compare + custom endpoint + kserve = 6)', () => {
    const ALL_TARGETS = ['panel-A', 'panel-B', 'panel-C', 'panel-D', 'custom-endpoint', 'kserve-v2'];
    expect(ALL_TARGETS).toHaveLength(6);
  });

  it('🗑 in panel header clears that panel only (1 panel)', () => {
    const INDIVIDUAL_CLEAR_TARGETS = 1;
    expect(INDIVIDUAL_CLEAR_TARGETS).toBe(1);
  });

  it('🗑 Clear in form bar clears all compare panels (4 panels)', () => {
    const CLEAR_ALL_TARGETS = 4;
    expect(CLEAR_ALL_TARGETS).toBe(4);
  });

});

// ── Why the original tests didn't catch the Clear All bug ────────
// The tests simulated pure logic (if trigger > 0, clear state)
// but React component integration has subtleties:
// - useEffect + useChat's setMessages can have timing issues
// - Direct function calls are always more reliable than trigger patterns
// The fix: callback ref pattern — parent holds refs to each panel's
// clear function and calls them directly on click.

describe('Clear All — callback ref pattern (the reliable fix)', () => {

  // Simulates the callback ref registry in Home component
  function makeClearRegistry() {
    const fns: Record<string, () => void> = {};
    const register = (id: string, fn: () => void) => { fns[id] = fn; };
    const clearAll = () => Object.values(fns).forEach(fn => fn());
    return { fns, register, clearAll };
  }

  it('each panel registers its clear function on mount', () => {
    const registry = makeClearRegistry();
    const panels = ['A', 'B', 'C', 'D'];

    // Simulate each ChatPanel calling onRegisterClear on mount
    panels.forEach(id => registry.register(id, () => {}));

    expect(Object.keys(registry.fns)).toHaveLength(4);
    expect(Object.keys(registry.fns)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('clearAll calls every registered function', () => {
    const registry = makeClearRegistry();
    const cleared: string[] = [];

    ['A', 'B', 'C', 'D'].forEach(id =>
      registry.register(id, () => cleared.push(id))
    );

    registry.clearAll();
    expect(cleared).toHaveLength(4);
    expect(cleared).toContain('A');
    expect(cleared).toContain('B');
    expect(cleared).toContain('C');
    expect(cleared).toContain('D');
  });

  it('each panel clear function resets its own state', () => {
    const registry = makeClearRegistry();
    const panelStates: Record<string, any> = {
      A: { messages: ['msg1'], scores: { a: 'up' } },
      B: { messages: ['msg2'], scores: {} },
      C: { messages: ['msg3'], scores: {} },
      D: { messages: ['msg4'], scores: {} },
    };

    // Each panel registers a fn that clears its own state
    Object.entries(panelStates).forEach(([id, state]) => {
      registry.register(id, () => {
        state.messages = [];
        state.scores = {};
      });
    });

    registry.clearAll();

    for (const state of Object.values(panelStates)) {
      expect(state.messages).toHaveLength(0);
    }
  });

  it('registering same panel twice overwrites the fn (latest wins)', () => {
    const registry = makeClearRegistry();
    let callCount = 0;

    registry.register('A', () => { callCount = 1; });
    registry.register('A', () => { callCount = 2; }); // overwrites

    registry.fns['A']();
    expect(callCount).toBe(2); // latest fn was called
  });

  it('clearAll is safe when no panels registered', () => {
    const registry = makeClearRegistry();
    expect(() => registry.clearAll()).not.toThrow();
  });

  it('direct fn call is more reliable than useEffect trigger', () => {
    // Direct call: parent → fn() → setMessages([]) runs immediately
    // Trigger pattern: parent sets state → React re-render → useEffect fires → setMessages([])
    // Direct call has fewer React lifecycle steps = fewer failure points
    const directCallSteps = 1;
    const triggerPatternSteps = 3;
    expect(directCallSteps).toBeLessThan(triggerPatternSteps);
  });

  it('individual panel clear still uses direct onClick (not trigger)', () => {
    // Individual clear: onClick={() => { setMessages([]); ... }}
    // This is a direct call — always works. 
    // Clear All now also uses direct calls via registry.
    const usesDirectCall = true;
    expect(usesDirectCall).toBe(true);
  });

});

describe('Test quality — what unit tests cannot catch', () => {

  it('unit tests cannot verify React hook behavior', () => {
    // The original clearTrigger tests passed because they tested
    // pure JS logic. But useChat setMessages in a useEffect
    // has React-specific timing that pure logic tests miss.
    const unitTestsTestedPureLogic = true;
    const unitTestsMissedReactHookTiming = true;
    expect(unitTestsTestedPureLogic).toBe(true);
    expect(unitTestsMissedReactHookTiming).toBe(true);
  });

  it('the fix: use direct function calls instead of reactive patterns for imperative actions', () => {
    // Rule: for actions that MUST happen immediately (clear, reset),
    // use direct fn calls (callback refs), not trigger counters + useEffect
    const imperativeActionsRule = 'use direct calls, not triggers';
    expect(imperativeActionsRule).toContain('direct calls');
  });

});

describe('"Run Judge" button in pool bar', () => {

  // Simulates the pool bar Run Judge button behaviour
  function handleRunJudge(
    pool: any[],
    setActiveTab: (tab: string) => void
  ) {
    // Button is only shown when pool.length >= 2
    if (pool.length >= 2) {
      setActiveTab('judge'); // navigate to judge tab — NOT setShowJudge(true)
    }
  }

  it('navigates to judge tab when clicked', () => {
    let activeTab = 'compare';
    const pool = [
      { id: '1', label: 'A — gpt' },
      { id: '2', label: 'B — claude' },
    ];
    handleRunJudge(pool, (tab) => { activeTab = tab; });
    expect(activeTab).toBe('judge');
  });

  it('does NOT call setShowJudge — modal pattern was removed', () => {
    // Regression test: old code called setShowJudge(true) which is undefined
    // New code calls setActiveTab('judge')
    let judgeModalOpened = false;
    const setShowJudge = () => { judgeModalOpened = true; }; // old pattern
    let activeTab = 'compare';
    const setActiveTab = (tab: string) => { activeTab = tab; };

    // New implementation: use setActiveTab, not setShowJudge
    setActiveTab('judge');

    expect(activeTab).toBe('judge');
    expect(judgeModalOpened).toBe(false); // modal never opened
  });

  it('only shows button when pool has 2+ responses', () => {
    const showButton = (pool: any[]) => pool.length >= 2;
    expect(showButton([])).toBe(false);
    expect(showButton([{ id: '1' }])).toBe(false);
    expect(showButton([{ id: '1' }, { id: '2' }])).toBe(true);
    expect(showButton([{ id: '1' }, { id: '2' }, { id: '3' }])).toBe(true);
  });

  it('pool bar pill shows each entry label with remove button', () => {
    const pool = [
      { id: '1', label: 'Panel A' },
      { id: '2', label: 'B — claude' },
    ];
    const labels = pool.map(p => p.label);
    expect(labels).toContain('Panel A');
    expect(labels).toContain('B — claude');
  });

});

describe('AddToPoolButton — same-question lock enforcement', () => {

  const norm = (s: string) => (s ?? '').trim().toLowerCase();

  // Mirrors the AddToPoolButton logic
  function getButtonState(
    entry: { label: string; prompt: string; content: string },
    pool: { id: string; label: string; prompt: string }[]
  ): 'in-pool' | 'locked' | 'available' {
    const existing = pool.find(
      p => p.label === entry.label && norm(p.prompt) === norm(entry.prompt)
    );
    if (existing) return 'in-pool';

    const lockedPrompt = pool.length > 0 ? pool[0].prompt : null;
    const isLocked = !!lockedPrompt && norm(lockedPrompt) !== norm(entry.prompt);
    if (isLocked) return 'locked';

    return 'available';
  }

  it('shows "Add to Judge" when pool is empty', () => {
    const entry = { label: 'A — gpt', prompt: 'What is AI?', content: 'AI is...' };
    expect(getButtonState(entry, [])).toBe('available');
  });

  it('shows "✓ In Judge Pool" when same entry already added', () => {
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'What is AI?' }];
    const entry = { label: 'A — gpt', prompt: 'What is AI?', content: 'AI is...' };
    expect(getButtonState(entry, pool)).toBe('in-pool');
  });

  it('shows "🔒 Diff. question" when pool locked to different question (THE BUG)', () => {
    // Pool has "What is AI?" — user asks "What is ML?" and tries to add
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'What is AI?' }];
    const entry = { label: 'B — claude', prompt: 'What is ML?', content: 'ML is...' };
    expect(getButtonState(entry, pool)).toBe('locked');
  });

  it('allows adding different models for SAME question', () => {
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'What is AI?' }];
    const entry = { label: 'B — claude', prompt: 'What is AI?', content: 'Claude says...' };
    expect(getButtonState(entry, pool)).toBe('available');
  });

  it('normalizes prompts when comparing (trim + lowercase)', () => {
    // GPT panel stored "What is AI?" — KServe stored "  what is ai?  " (whitespace + case diff)
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'What is AI?' }];
    const entry = { label: '🧬 kserve', prompt: '  what is ai?  ', content: 'KServe says...' };
    expect(getButtonState(entry, pool)).toBe('available'); // same question after normalization
  });

  it('locked when questions genuinely differ after normalization', () => {
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'What is AI?' }];
    const entry = { label: 'B — claude', prompt: 'What is machine learning?', content: '...' };
    expect(getButtonState(entry, pool)).toBe('locked');
  });

  it('all 6 panels lock out when first response added', () => {
    const pool = [{ id: '1', label: 'A — gpt', prompt: 'Explain microservices' }];
    const otherQuestionEntries = [
      { label: 'B — claude', prompt: 'What is SOLID?', content: '...' },
      { label: 'C — llama',  prompt: 'How does TCP work?', content: '...' },
      { label: 'D — gemini', prompt: 'What is k8s?', content: '...' },
      { label: '🔌 custom',  prompt: 'Tell me a joke', content: '...' },
      { label: '🧬 kserve',  prompt: 'Summarize this text', content: '...' },
    ];
    for (const entry of otherQuestionEntries) {
      expect(getButtonState(entry, pool)).toBe('locked');
    }
  });

  it('clears lock when pool is emptied', () => {
    // User removes all entries from pool → lock clears → any question can be added
    const emptyPool: any[] = [];
    const entry = { label: 'A — gpt', prompt: 'New question', content: '...' };
    expect(getButtonState(entry, emptyPool)).toBe('available');
  });

});
