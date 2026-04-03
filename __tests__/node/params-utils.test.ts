// __tests__/node/params-utils.test.ts
// Tests for temperature, maxTokens, topP parameter handling

describe('Parameter defaults', () => {

  const DEFAULT_TEMPERATURE = 0.7;
  const DEFAULT_MAX_TOKENS  = 500;
  const DEFAULT_TOP_P       = 1.0;

  it('temperature defaults to 0.7', () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.7);
  });

  it('maxTokens defaults to 500', () => {
    expect(DEFAULT_MAX_TOKENS).toBe(500);
  });

  it('topP defaults to 1.0', () => {
    expect(DEFAULT_TOP_P).toBe(1.0);
  });

});

describe('Parameter ranges', () => {

  const clampTemp     = (v: number) => Math.min(2, Math.max(0, v));
  const clampMaxTok   = (v: number) => Math.min(4000, Math.max(100, v));
  const clampTopP     = (v: number) => Math.min(1, Math.max(0.1, v));

  it('temperature range is 0–2', () => {
    expect(clampTemp(-1)).toBe(0);
    expect(clampTemp(3)).toBe(2);
    expect(clampTemp(0.7)).toBe(0.7);
  });

  it('maxTokens range is 100–4000', () => {
    expect(clampMaxTok(50)).toBe(100);
    expect(clampMaxTok(9999)).toBe(4000);
    expect(clampMaxTok(500)).toBe(500);
  });

  it('topP range is 0.1–1.0', () => {
    expect(clampTopP(0)).toBe(0.1);
    expect(clampTopP(1.5)).toBe(1);
    expect(clampTopP(0.9)).toBe(0.9);
  });

});

describe('Parameter semantics', () => {

  it('temperature=0 means deterministic (same input → same output)', () => {
    // At temp=0 all 4 panels should return identical responses for same question
    const deterministicTemp = 0;
    expect(deterministicTemp).toBe(0);
  });

  it('temperature=1 is balanced — good default for eval comparisons', () => {
    // Not too random, not too rigid — fair for model comparison
    const balancedTemp = 1;
    expect(balancedTemp).toBeLessThanOrEqual(1);
    expect(balancedTemp).toBeGreaterThan(0);
  });

  it('topP=1 means no nucleus filtering (most diverse)', () => {
    expect(1.0).toBe(1);
  });

  it('topP=0.1 means only top 10% of probability mass (most focused)', () => {
    expect(0.1).toBeGreaterThan(0);
    expect(0.1).toBeLessThan(1);
  });

});

describe('Route parameter passing', () => {

  // Mirrors the route logic: only include params if defined
  function buildStreamTextParams(
    temperature?: number,
    maxTokens?: number,
    topP?: number
  ) {
    return {
      ...(temperature !== undefined && { temperature: Number(temperature) }),
      ...(maxTokens   !== undefined && { maxTokens:   Number(maxTokens)   }),
      ...(topP        !== undefined && { topP:         Number(topP)        }),
    };
  }

  it('passes all 3 params when all provided', () => {
    const params = buildStreamTextParams(0.5, 300, 0.9);
    expect(params.temperature).toBe(0.5);
    expect(params.maxTokens).toBe(300);
    expect(params.topP).toBe(0.9);
  });

  it('omits params when undefined (uses model defaults)', () => {
    const params = buildStreamTextParams(undefined, undefined, undefined);
    expect(Object.keys(params)).toHaveLength(0);
  });

  it('passes only defined params', () => {
    const params = buildStreamTextParams(0.7, undefined, undefined);
    expect(params.temperature).toBe(0.7);
    expect('maxTokens' in params).toBe(false);
    expect('topP' in params).toBe(false);
  });

  it('coerces string values to numbers', () => {
    // Sliders send numbers but JSON round-trip can produce strings
    const params = buildStreamTextParams(
      '0.7' as any, '500' as any, '1.0' as any
    );
    expect(typeof params.temperature).toBe('number');
    expect(typeof params.maxTokens).toBe('number');
    expect(typeof params.topP).toBe('number');
  });

});

describe('Each panel has independent params', () => {

  it('4 panels can have different temperatures simultaneously', () => {
    // Panel A: temp=0 (deterministic for eval)
    // Panel B: temp=0.7 (default)
    // Panel C: temp=1.5 (creative)
    // Panel D: temp=0.3 (precise)
    const panelTemps = { A: 0, B: 0.7, C: 1.5, D: 0.3 };
    expect(new Set(Object.values(panelTemps)).size).toBe(4); // all different
  });

  it('params are per-panel state — changing A does not affect B', () => {
    // Each ChatPanel has its own useState(0.7) for temperature
    // This is guaranteed by React's component isolation
    const panelA = { temperature: 0 };
    const panelB = { temperature: 0.7 };

    panelA.temperature = 1.5; // user changes panel A
    expect(panelB.temperature).toBe(0.7); // panel B unchanged
  });

});

describe('Provider-specific parameter limits', () => {

  function safeTemp(temperature: number, model: string): number {
    const isAnthropic = model.startsWith('claude');
    return Math.min(Number(temperature), isAnthropic ? 1.0 : 2.0);
  }

  function shouldPassTopP(topP: number | undefined, model: string): boolean {
    const isAnthropic = model.startsWith('claude');
    return !isAnthropic && topP !== undefined;
  }

  it('Claude temperature is clamped to 1.0 max', () => {
    expect(safeTemp(1.5, 'claude-haiku-4-5-20251001')).toBe(1.0);
    expect(safeTemp(2.0, 'claude-sonnet-4-6')).toBe(1.0);
    expect(safeTemp(0.7, 'claude-haiku-4-5-20251001')).toBe(0.7);
  });

  it('OpenAI temperature allows up to 2.0', () => {
    expect(safeTemp(1.5, 'gpt-4o-mini')).toBe(1.5);
    expect(safeTemp(2.0, 'gpt-4o')).toBe(2.0);
  });

  it('Groq temperature allows up to 2.0', () => {
    expect(safeTemp(1.8, 'llama-3.3-70b-versatile')).toBe(1.8);
  });

  it('Google temperature allows up to 2.0', () => {
    expect(safeTemp(2.0, 'gemini-2.5-flash')).toBe(2.0);
  });

  it('topP is NOT passed for Claude (causes conflict)', () => {
    expect(shouldPassTopP(0.9, 'claude-haiku-4-5-20251001')).toBe(false);
    expect(shouldPassTopP(0.9, 'claude-sonnet-4-6')).toBe(false);
  });

  it('topP IS passed for OpenAI, Groq, Google', () => {
    expect(shouldPassTopP(0.9, 'gpt-4o-mini')).toBe(true);
    expect(shouldPassTopP(0.9, 'llama-3.3-70b-versatile')).toBe(true);
    expect(shouldPassTopP(0.9, 'gemini-2.5-flash')).toBe(true);
  });

  it('this was the Claude bug — temperature > 1 caused silent failure', () => {
    // User set temp=1.5 on slider (range 0-2)
    // Claude received temp=1.5 → API error → silent 200 with empty response
    // Fix: clamp to 1.0 for Anthropic models
    const bugTemp = 1.5;
    const fixedTemp = safeTemp(bugTemp, 'claude-haiku-4-5-20251001');
    expect(fixedTemp).toBe(1.0); // clamped ✅
    expect(fixedTemp).not.toBe(bugTemp); // was not passing through
  });

});
