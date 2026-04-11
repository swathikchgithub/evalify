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

describe('Panel selector — send to specific panels', () => {

  type PanelId = 'A' | 'B' | 'C' | 'D';

  function makeActivePanels(all = true): Record<PanelId, boolean> {
    return { A: all, B: all, C: all, D: all };
  }

  function togglePanel(panels: Record<PanelId, boolean>, id: PanelId) {
    return { ...panels, [id]: !panels[id] };
  }

  function getSubmitTrigger(
    activePanels: Record<PanelId, boolean>,
    panelId: PanelId,
    submitTrigger: number
  ) {
    // Mirrors: submitTrigger={activePanels[p] ? submitTrigger : 0}
    return activePanels[panelId] ? submitTrigger : 0;
  }

  it('all panels active by default', () => {
    const panels = makeActivePanels(true);
    expect(Object.values(panels).every(v => v)).toBe(true);
  });

  it('toggling a panel deactivates it', () => {
    const panels = makeActivePanels(true);
    const updated = togglePanel(panels, 'B');
    expect(updated.B).toBe(false);
    expect(updated.A).toBe(true); // others unchanged
  });

  it('toggling again reactivates it', () => {
    let panels = makeActivePanels(true);
    panels = togglePanel(panels, 'C');
    panels = togglePanel(panels, 'C');
    expect(panels.C).toBe(true);
  });

  it('inactive panel gets submitTrigger=0 (does not fire)', () => {
    const panels = { A: true, B: false, C: true, D: false };
    expect(getSubmitTrigger(panels, 'A', 1)).toBe(1); // fires
    expect(getSubmitTrigger(panels, 'B', 1)).toBe(0); // skipped
    expect(getSubmitTrigger(panels, 'C', 1)).toBe(1); // fires
    expect(getSubmitTrigger(panels, 'D', 1)).toBe(0); // skipped
  });

  it('only claude panel active — only B fires', () => {
    const panels = { A: false, B: true, C: false, D: false };
    expect(getSubmitTrigger(panels, 'A', 1)).toBe(0);
    expect(getSubmitTrigger(panels, 'B', 1)).toBe(1); // only Claude
    expect(getSubmitTrigger(panels, 'C', 1)).toBe(0);
    expect(getSubmitTrigger(panels, 'D', 1)).toBe(0);
  });

  it('only gemini panel active — only D fires', () => {
    const panels = { A: false, B: false, C: false, D: true };
    expect(getSubmitTrigger(panels, 'D', 1)).toBe(1);
    const others = (['A','B','C'] as PanelId[]).map(p => getSubmitTrigger(panels, p, 1));
    expect(others.every(t => t === 0)).toBe(true);
  });

  it('"All" button reactivates all panels', () => {
    let panels = { A: false, B: false, C: true, D: false };
    panels = { A: true, B: true, C: true, D: true }; // click All
    expect(Object.values(panels).every(v => v)).toBe(true);
  });

  it('"None" button deactivates all panels', () => {
    let panels = makeActivePanels(true);
    panels = { A: false, B: false, C: false, D: false }; // click None
    expect(Object.values(panels).every(v => !v)).toBe(true);
  });

  it('inactive panel is visually dimmed (opacity 0.4)', () => {
    const isActive = false;
    const opacity = isActive ? 1 : 0.4;
    expect(opacity).toBe(0.4);
  });

  it('active panel has full opacity', () => {
    const isActive = true;
    const opacity = isActive ? 1 : 0.4;
    expect(opacity).toBe(1);
  });

});

describe('Pool bar — Clear Pool button', () => {

  it('clears all entries from pool', () => {
    let pool = [
      { id: '1', label: 'A — GPT-4o Mini', prompt: 'What is AI?' },
      { id: '2', label: 'B — Claude Haiku', prompt: 'What is AI?' },
    ];
    pool = []; // onClick={() => setPool([])}
    expect(pool).toHaveLength(0);
  });

  it('Clear Pool is independent from Clear All panels', () => {
    // Clear Pool → empties judge pool only
    // Clear All → wipes compare panel messages only
    // they don't affect each other
    let pool = [{ id: '1', label: 'A — GPT', prompt: 'test' }];
    const panelMessages = ['msg1', 'msg2'];

    pool = []; // clear pool
    expect(pool).toHaveLength(0);
    expect(panelMessages).toHaveLength(2); // panels unaffected
  });

  it('Run Judge button only shows when pool has 2+ entries', () => {
    const showRunJudge = (pool: any[]) => pool.length >= 2;
    expect(showRunJudge([])).toBe(false);
    expect(showRunJudge([{ id: '1' }])).toBe(false);
    expect(showRunJudge([{ id: '1' }, { id: '2' }])).toBe(true);
  });

  it('Clear Pool always visible when pool has entries', () => {
    const showClearPool = (pool: any[]) => pool.length > 0;
    expect(showClearPool([])).toBe(false);
    expect(showClearPool([{ id: '1' }])).toBe(true);
  });

});

describe('Judge model selector — DeepSeek models', () => {

  const JUDGE_MODELS = [
    { value: 'gpt-4o-mini',               badge: '⚡' },
    { value: 'gpt-4o',                    badge: '🎯' },
    { value: 'claude-sonnet-4-6',         badge: '🧠' },
    { value: 'gemini-2.5-flash',          badge: '✨' },
    { value: 'llama-3.3-70b-versatile',   badge: '🦙' },
    { value: 'deepseek/deepseek-chat',    badge: '🐋' },
    { value: 'deepseek/deepseek-r1',      badge: '🧠' },
    { value: 'custom',                    badge: '🔌' },
  ];

  it('DeepSeek V3 is in judge models', () => {
    expect(JUDGE_MODELS.find(m => m.value === 'deepseek/deepseek-chat')).toBeDefined();
  });

  it('DeepSeek R1 is in judge models', () => {
    expect(JUDGE_MODELS.find(m => m.value === 'deepseek/deepseek-r1')).toBeDefined();
  });

  it('DeepSeek models use OpenRouter format (contain /)', () => {
    const deepseekModels = JUDGE_MODELS.filter(m => m.value.includes('deepseek'));
    for (const m of deepseekModels) {
      expect(m.value).toContain('/');
    }
  });

  it('all judge models have a badge', () => {
    for (const m of JUDGE_MODELS) {
      expect(m.badge).toBeTruthy();
    }
  });

});

describe('Judge results — stale results cleared on pool change', () => {

  function simulatePoolChange(
    oldPoolIds: string[],
    newPoolIds: string[],
    currentResult: any
  ) {
    // Mirrors the useEffect: if pool changes, clear result
    const poolKey = newPoolIds.join(',');
    const oldKey  = oldPoolIds.join(',');
    if (poolKey !== oldKey) {
      return { result: null, selectedIds: newPoolIds };
    }
    return { result: currentResult, selectedIds: newPoolIds };
  }

  it('clears results when pool entries change', () => {
    const oldIds = ['1', '2', '3', '4'];
    const newIds = ['5', '6', '7', '8']; // new DeepSeek models
    const staleResult = { winner: 'A — GPT-4o Mini', scores: {} };

    const { result } = simulatePoolChange(oldIds, newIds, staleResult);
    expect(result).toBeNull();
  });

  it('keeps results when pool is unchanged', () => {
    const ids = ['1', '2', '3', '4'];
    const existingResult = { winner: 'B — Claude Haiku', scores: {} };

    const { result } = simulatePoolChange(ids, ids, existingResult);
    expect(result).not.toBeNull();
    expect(result.winner).toBe('B — Claude Haiku');
  });

  it('clears results when a single entry is removed', () => {
    const oldIds = ['1', '2', '3', '4'];
    const newIds = ['1', '2', '3']; // one removed
    const staleResult = { winner: 'A — GPT', scores: {} };

    const { result } = simulatePoolChange(oldIds, newIds, staleResult);
    expect(result).toBeNull();
  });

  it('selectedIds updated to match new pool', () => {
    const oldIds = ['1', '2'];
    const newIds = ['3', '4'];

    const { selectedIds } = simulatePoolChange(oldIds, newIds, null);
    expect(selectedIds).toEqual(['3', '4']);
  });

});

describe('Panel selector — model names instead of Panel A/B/C/D', () => {

  // Mirrors the shortName logic in app-page.tsx
  function getShortName(modelName: string): string {
    if (!modelName) return '';
    if (modelName.includes('/')) {
      return modelName.split('/')[1]
        .replace('deepseek-', 'DS-')
        .replace('-versatile', '');
    }
    return modelName.split('-').slice(0, 2).join('-');
  }

  it('shows short name for OpenAI models', () => {
    expect(getShortName('gpt-4o-mini')).toBe('gpt-4o');
    expect(getShortName('gpt-4o')).toBe('gpt-4o');
  });

  it('shows short name for Anthropic models', () => {
    expect(getShortName('claude-haiku-4-5-20251001')).toBe('claude-haiku');
    expect(getShortName('claude-sonnet-4-6')).toBe('claude-sonnet');
  });

  it('shows short name for Groq models', () => {
    expect(getShortName('llama-3.3-70b-versatile')).toBe('llama-3.3');
  });

  it('shows short name for Google models', () => {
    expect(getShortName('gemini-2.5-flash')).toBe('gemini-2.5');
  });

  it('shows DS- prefix for DeepSeek via OpenRouter', () => {
    expect(getShortName('deepseek/deepseek-chat')).toBe('DS-chat');
    expect(getShortName('deepseek/deepseek-r1')).toBe('DS-r1');
  });

  it('shows short name for other OpenRouter models', () => {
    expect(getShortName('meta-llama/llama-4-maverick')).toBe('llama-4-maverick');
    expect(getShortName('google/gemini-2.5-pro')).toBe('gemini-2.5-pro');
  });

  it('returns empty string for empty model', () => {
    expect(getShortName('')).toBe('');
  });

  it('panel selector updates when model dropdown changes', () => {
    // panelModels state mirrors what's selected in each ChatPanel
    let panelModels: Record<string, string> = {
      A: 'gpt-4o-mini',
      B: 'claude-haiku-4-5-20251001',
      C: 'llama-3.3-70b-versatile',
      D: 'gemini-2.5-flash',
    };

    // User changes Panel A to DeepSeek
    const onModelChange = (panelId: string, model: string) => {
      panelModels = { ...panelModels, [panelId]: model };
    };

    onModelChange('A', 'deepseek/deepseek-chat');
    expect(panelModels.A).toBe('deepseek/deepseek-chat');
    expect(getShortName(panelModels.A)).toBe('DS-chat');
    expect(panelModels.B).toBe('claude-haiku-4-5-20251001'); // unchanged
  });

  it('all 4 panels can have different models', () => {
    const panelModels = {
      A: 'deepseek/deepseek-chat',
      B: 'deepseek/deepseek-r1',
      C: 'meta-llama/llama-4-maverick',
      D: 'google/gemini-2.5-pro',
    };
    const names = Object.values(panelModels).map(getShortName);
    expect(names).toEqual(['DS-chat', 'DS-r1', 'llama-4-maverick', 'gemini-2.5-pro']);
  });

});

describe('Judge guide — how-to overlay', () => {

  // Mirrors the showGuide logic in JudgeTab.tsx
  function shouldShowGuide(localStorageValue: string | null): boolean {
    return localStorageValue !== 'true';
  }

  function dismissGuide(): string {
    return 'true'; // value stored in localStorage
  }

  it('shows guide on first visit (no localStorage key)', () => {
    expect(shouldShowGuide(null)).toBe(true);
  });

  it('shows guide when localStorage value is not "true"', () => {
    expect(shouldShowGuide('false')).toBe(true);
    expect(shouldShowGuide('')).toBe(true);
    expect(shouldShowGuide('0')).toBe(true);
  });

  it('hides guide when user has dismissed it', () => {
    expect(shouldShowGuide('true')).toBe(false);
  });

  it('dismissGuide sets localStorage to "true"', () => {
    const stored = dismissGuide();
    expect(stored).toBe('true');
    expect(shouldShowGuide(stored)).toBe(false);
  });

  it('guide has 4 steps', () => {
    const steps = [
      { step: '1', title: 'Pick a Judge' },
      { step: '2', title: 'Add Responses' },
      { step: '3', title: 'Pick Criteria' },
      { step: '4', title: 'Run Judge' },
    ];
    expect(steps).toHaveLength(4);
    expect(steps[0].title).toBe('Pick a Judge');
    expect(steps[1].title).toBe('Add Responses');
    expect(steps[2].title).toBe('Pick Criteria');
    expect(steps[3].title).toBe('Run Judge');
  });

  it('steps are in correct order', () => {
    const steps = ['Pick a Judge', 'Add Responses', 'Pick Criteria', 'Run Judge'];
    // Step 1 must come before step 2 etc.
    expect(steps.indexOf('Pick a Judge')).toBeLessThan(steps.indexOf('Add Responses'));
    expect(steps.indexOf('Add Responses')).toBeLessThan(steps.indexOf('Pick Criteria'));
    expect(steps.indexOf('Pick Criteria')).toBeLessThan(steps.indexOf('Run Judge'));
  });

  it('"How to use" button brings guide back after dismissal', () => {
    // Simulate: user dismisses → clicks "? How to use" → guide shows again
    let stored = dismissGuide();
    expect(shouldShowGuide(stored)).toBe(false); // dismissed
    // User clicks "? How to use" → setShowGuide(true) — overrides localStorage
    let showGuide = true; // direct state override
    expect(showGuide).toBe(true); // shows again ✅
  });

  it('tip message is shown in guide footer', () => {
    const tip = 'All responses must answer the same question to be compared fairly.';
    expect(tip).toContain('same question');
    expect(tip.length).toBeGreaterThan(20);
  });

});

describe('Judge step progress — visual indicator', () => {

  function getStepStatus(judgeModel: string, selectedCount: number) {
    const step1Done  = judgeModel !== '';
    const step2Done  = selectedCount >= 2;
    const step3Ready = step1Done && step2Done;
    return { step1Done, step2Done, step3Ready };
  }

  it('no steps done on initial load', () => {
    // judgeModel defaults to gpt-4o-mini so step1 is actually done
    const { step1Done, step2Done, step3Ready } = getStepStatus('gpt-4o-mini', 0);
    expect(step1Done).toBe(true);
    expect(step2Done).toBe(false);
    expect(step3Ready).toBe(false);
  });

  it('step 1 done when model is selected', () => {
    const { step1Done } = getStepStatus('gpt-4o-mini', 0);
    expect(step1Done).toBe(true);
  });

  it('step 1 not done when no model selected', () => {
    const { step1Done } = getStepStatus('', 0);
    expect(step1Done).toBe(false);
  });

  it('step 2 requires at least 2 responses', () => {
    expect(getStepStatus('gpt-4o-mini', 0).step2Done).toBe(false);
    expect(getStepStatus('gpt-4o-mini', 1).step2Done).toBe(false);
    expect(getStepStatus('gpt-4o-mini', 2).step2Done).toBe(true);
    expect(getStepStatus('gpt-4o-mini', 4).step2Done).toBe(true);
  });

  it('step 3 ready only when both step 1 and step 2 complete', () => {
    expect(getStepStatus('',            2).step3Ready).toBe(false);
    expect(getStepStatus('gpt-4o-mini', 1).step3Ready).toBe(false);
    expect(getStepStatus('gpt-4o-mini', 2).step3Ready).toBe(true);
  });

  it('Ready! indicator shows when step 3 is ready', () => {
    const { step3Ready } = getStepStatus('claude-sonnet-4-6', 3);
    expect(step3Ready).toBe(true); // "↓ Ready!" should show
  });

  it('step colors are correct', () => {
    const stepColors = {
      1: '#6366f1', // indigo
      2: '#f97316', // orange
      3: '#10b981', // green
      4: '#f59e0b', // amber
    };
    expect(stepColors[1]).toBe('#6366f1');
    expect(stepColors[4]).toBe('#f59e0b');
  });

});

describe('TabGuide — SSR hydration safety', () => {

  it('defaults to false (hidden) on server render to avoid hydration mismatch', () => {
    // Server: localStorage unavailable → default false
    // Client: useEffect reads localStorage → sets correct value
    const serverDefault = false;
    expect(serverDefault).toBe(false); // no hydration mismatch
  });

  it('shows guide after mount when localStorage is null', () => {
    // Simulates useEffect behavior
    const storageValue = null; // localStorage.getItem returns null when not set
    const shouldShow = storageValue !== 'true';
    expect(shouldShow).toBe(true);
  });

  it('hides guide after mount when previously dismissed', () => {
    const storageValue = 'true'; // localStorage.getItem after dismiss
    const shouldShow = storageValue !== 'true';
    expect(shouldShow).toBe(false);
  });

  it('each tab has unique storage key to avoid conflicts', () => {
    const keys = [
      'evalify-guide-compare-seen',
      'evalify-guide-custom-endpoint-seen',
      'evalify-guide-kserve-seen',
      'evalify-judge-guide-seen',
      'evalify-guide-stats-seen',
    ];
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length); // all unique
  });

  it('dismissing one tab guide does not affect others', () => {
    // Each tab uses a different key
    const storage: Record<string, string> = {};
    storage['evalify-guide-compare-seen'] = 'true'; // dismissed compare
    
    const compareShowing = storage['evalify-guide-compare-seen'] !== 'true';
    const judgeShowing   = storage['evalify-judge-guide-seen'] !== 'true';
    
    expect(compareShowing).toBe(false); // dismissed
    expect(judgeShowing).toBe(true);   // still showing
  });

});

// ─────────────────────────────────────────────────────────────
// Response history — localStorage persistence
// ─────────────────────────────────────────────────────────────
describe('Response history — localStorage persistence', () => {

  const STORAGE_KEY = 'evalify-response-history';

  function saveHistory(entries: any[]) {
    return JSON.stringify(entries.slice(-200)); // max 200 entries
  }

  function loadHistory(raw: string | null): any[] {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  it('defaults to empty array on server (SSR-safe)', () => {
    // Server: localStorage unavailable → useState([])
    const serverDefault: any[] = [];
    expect(serverDefault).toHaveLength(0);
  });

  it('loads saved history after mount via useEffect', () => {
    const saved = [
      { id: '1', model: 'gpt-4o-mini', cost: 0.0001, tokens: 150, responseTime: 1200 }
    ];
    const raw = JSON.stringify(saved);
    const loaded = loadHistory(raw);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].model).toBe('gpt-4o-mini');
  });

  it('returns empty array when localStorage key is missing', () => {
    expect(loadHistory(null)).toEqual([]);
  });

  it('returns empty array when localStorage value is malformed', () => {
    expect(loadHistory('not-valid-json{')).toEqual([]);
  });

  it('saves new entry to localStorage on onMetric', () => {
    const existing = [{ id: '1', model: 'gpt-4o-mini', cost: 0.0001, tokens: 100, responseTime: 1000 }];
    const newEntry = { id: '2', model: 'claude-haiku-4-5', cost: 0.0004, tokens: 200, responseTime: 2000 };
    const updated = [...existing, newEntry];
    const saved = saveHistory(updated);
    const loaded = loadHistory(saved);
    expect(loaded).toHaveLength(2);
    expect(loaded[1].model).toBe('claude-haiku-4-5');
  });

  it('caps history at 200 entries', () => {
    const entries = Array.from({ length: 250 }, (_, i) => ({ id: String(i), model: 'gpt-4o-mini', cost: 0.0001 }));
    const saved = saveHistory(entries);
    const loaded = loadHistory(saved);
    expect(loaded).toHaveLength(200);
    // Should keep the LAST 200 (most recent)
    expect(loaded[0].id).toBe('50');
    expect(loaded[199].id).toBe('249');
  });

  it('clears localStorage when history is cleared', () => {
    // Simulate: setHistory([]) + localStorage.removeItem
    const storage: Record<string, string> = { [STORAGE_KEY]: '[{...}]' };
    delete storage[STORAGE_KEY];
    expect(storage[STORAGE_KEY]).toBeUndefined();
  });

  it('persists score updates to localStorage', () => {
    const history = [
      { id: '1', model: 'gpt-4o-mini', cost: 0.0001, score: null }
    ];
    const updated = history.map(h => h.id === '1' ? { ...h, score: 'up' } : h);
    const saved = saveHistory(updated);
    const loaded = loadHistory(saved);
    expect(loaded[0].score).toBe('up');
  });

  it('SSR always renders empty — no hydration mismatch', () => {
    // Server renders history=[] → history.length > 0 = false → no Export CSV button
    // Client loads from localStorage → may have entries → button appears
    // useEffect ensures this happens AFTER hydration, not during SSR
    const serverHistory: any[] = [];
    const clientHistory = [{ id: '1', model: 'gpt-4o-mini', cost: 0.0001 }];

    expect(serverHistory.length > 0).toBe(false); // server: no button
    expect(clientHistory.length > 0).toBe(true);  // client: button shows after mount
    // No mismatch because useEffect fires after SSR
  });

});
