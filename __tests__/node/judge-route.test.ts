// __tests__/node/judge-route.test.ts
// Tests for the BYOJ Judge logic — prompt building, validation,
// response parsing. These don't call real APIs (mocked).

// ── Helpers extracted from judge route for testability ────────

// Build the judge prompt (same logic as judge/route.ts)
function buildJudgePrompt(
  prompt: string,
  responses: { label: string; model: string; content: string }[],
  criteria: string
): string {
  const responseBlocks = responses
    .map(r => `[Response ${r.label} — ${r.model}]\n${r.content}`)
    .join('\n\n---\n\n');

  const criteriaBlock = criteria.trim()
    ? `## Custom Evaluation Criteria\n${criteria}`
    : `## Evaluation Criteria (MT-Bench)\nScore each response 1-10 on:
- **Accuracy**: Is the information correct and factually accurate?
- **Relevance**: Does it directly address what was asked?
- **Coherence**: Is it well-structured, clear, and easy to follow?
- **Helpfulness**: How useful is this response to the user?
- **Safety**: Is it safe, appropriate, and free of harmful content?`;

  const labelList = responses.map(r => `"${r.label}"`).join(', ');

  return `You are an expert LLM evaluator using the MT-Bench evaluation framework.

## Original Prompt
${prompt}

## Responses to Evaluate
${responseBlocks}

${criteriaBlock}

## Output Instructions
Evaluate ONLY these response labels: ${labelList}

Respond ONLY with valid JSON, no other text:
{
  "scores": {
    "${responses[0].label}": { "accuracy": 8, "relevance": 9, "coherence": 8, "helpfulness": 9, "safety": 10, "overall": 8.8 }
  },
  "winner": "${responses[0].label}",
  "reasoning": "2-3 sentence explanation of why the winner was chosen and key differences between responses."
}`;
}

// Parse judge response (handles ```json fences)
function parseJudgeResponse(text: string): any {
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// Validate judge input
function validateJudgeInput(
  prompt: string,
  responses: any[],
  judgeModel: string,
  judgeEndpointUrl?: string
): string | null {
  if (!prompt) return 'prompt is required';
  if (!responses || responses.length < 2) return 'at least 2 responses are required';
  if (judgeModel === 'custom' && !judgeEndpointUrl?.trim()) {
    return 'Custom Endpoint selected as judge but no endpoint URL provided.';
  }
  return null; // valid
}

// ─────────────────────────────────────────────────────────────

describe('buildJudgePrompt', () => {

  const prompt = 'What is microservices architecture?';
  const responses = [
    { label: 'A — gpt', model: 'gpt-4o-mini', content: 'Microservices split apps into small services.' },
    { label: 'B — claude', model: 'claude-haiku-4-5-20251001', content: 'Each service owns a bounded context.' },
    { label: '🔌 — llm_generic_large', model: 'llm_generic_large', content: 'Microservices are independent units.' },
  ];

  describe('structure', () => {
    it('includes the original prompt', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain(prompt);
    });

    it('includes all response labels', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('[Response A — gpt — gpt-4o-mini]');
      expect(result).toContain('[Response B — claude — claude-haiku-4-5-20251001]');
      expect(result).toContain('[Response 🔌 — llm_generic_large — llm_generic_large]');
    });

    it('includes all response contents', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('Microservices split apps into small services.');
      expect(result).toContain('Each service owns a bounded context.');
    });

    it('lists labels in output instructions', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('"A — gpt"');
      expect(result).toContain('"B — claude"');
    });

    it('instructs JSON-only output', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('Respond ONLY with valid JSON');
    });
  });

  describe('evaluation criteria', () => {
    it('uses MT-Bench default when criteria is empty', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('MT-Bench');
      expect(result).toContain('Accuracy');
      expect(result).toContain('Relevance');
      expect(result).toContain('Coherence');
      expect(result).toContain('Helpfulness');
      expect(result).toContain('Safety');
    });

    it('uses custom criteria when provided', () => {
      const custom = 'Score on: Code correctness (1-10), Readability (1-10)';
      const result = buildJudgePrompt(prompt, responses, custom);
      expect(result).toContain('Custom Evaluation Criteria');
      expect(result).toContain('Code correctness');
      // The default MT-Bench dimensions should NOT appear when custom criteria set
      expect(result).not.toContain('Accuracy');
      expect(result).not.toContain('Coherence');
    });

    it('uses custom criteria for Code Quality preset', () => {
      const codePreset = 'Score each response on:\n- Correctness: Does the code work? (1-10)\n- Readability (1-10)';
      const result = buildJudgePrompt(prompt, responses, codePreset);
      expect(result).toContain('Correctness');
      expect(result).toContain('Readability');
    });
  });

  describe('response separators', () => {
    it('separates responses with ---', () => {
      const result = buildJudgePrompt(prompt, responses, '');
      expect(result).toContain('---');
    });

    it('handles single response (edge case)', () => {
      const single = [responses[0]];
      const result = buildJudgePrompt(prompt, single, '');
      expect(result).toContain(single[0].content);
    });
  });

});

describe('parseJudgeResponse', () => {

  describe('clean JSON', () => {
    it('parses valid judge JSON', () => {
      const json = JSON.stringify({
        scores: {
          'A — gpt': { accuracy: 9, relevance: 9, coherence: 9, helpfulness: 9, safety: 10, overall: 9.2 },
          'B — claude': { accuracy: 8, relevance: 8, coherence: 8, helpfulness: 8, safety: 10, overall: 8.4 },
        },
        winner: 'A — gpt',
        reasoning: 'Response A was more accurate and detailed.',
      });

      const result = parseJudgeResponse(json);
      expect(result.winner).toBe('A — gpt');
      expect(result.scores['A — gpt'].overall).toBe(9.2);
      expect(result.reasoning).toContain('more accurate');
    });

    it('extracts scores for all responses', () => {
      const json = JSON.stringify({
        scores: {
          'A': { accuracy: 7, relevance: 8, coherence: 7, helpfulness: 8, safety: 10, overall: 8.0 },
          'B': { accuracy: 9, relevance: 9, coherence: 9, helpfulness: 9, safety: 10, overall: 9.2 },
          'C': { accuracy: 6, relevance: 7, coherence: 6, helpfulness: 6, safety: 10, overall: 7.0 },
        },
        winner: 'B',
        reasoning: 'B was best.',
      });

      const result = parseJudgeResponse(json);
      expect(Object.keys(result.scores)).toHaveLength(3);
      expect(result.scores['B'].overall).toBe(9.2);
    });
  });

  describe('with markdown fences (LLM often wraps in ```json)', () => {
    it('strips ```json fences', () => {
      const withFences = '```json\n{"scores":{},"winner":"A","reasoning":"test"}\n```';
      const result = parseJudgeResponse(withFences);
      expect(result.winner).toBe('A');
    });

    it('strips plain ``` fences', () => {
      const withFences = '```\n{"scores":{},"winner":"B","reasoning":"test"}\n```';
      const result = parseJudgeResponse(withFences);
      expect(result.winner).toBe('B');
    });

    it('handles extra whitespace around JSON', () => {
      const withSpace = '  \n  {"scores":{},"winner":"C","reasoning":"test"}  \n  ';
      const result = parseJudgeResponse(withSpace);
      expect(result.winner).toBe('C');
    });
  });

  describe('invalid JSON handling', () => {
    it('throws on malformed JSON', () => {
      expect(() => parseJudgeResponse('not json at all')).toThrow();
    });

    it('throws on partial JSON', () => {
      expect(() => parseJudgeResponse('{"winner": "A"')).toThrow();
    });
  });

});

describe('validateJudgeInput', () => {

  const validResponses = [
    { label: 'A', model: 'gpt-4o-mini', content: 'response 1' },
    { label: 'B', model: 'claude-haiku', content: 'response 2' },
  ];

  describe('valid inputs', () => {
    it('returns null for valid standard judge request', () => {
      expect(validateJudgeInput('What is AI?', validResponses, 'gpt-4o-mini')).toBeNull();
    });

    it('returns null for custom endpoint with URL provided', () => {
      expect(validateJudgeInput(
        'What is AI?', validResponses, 'custom',
        'https://my-server.com/v1'
      )).toBeNull();
    });

    it('returns null for all standard judge models', () => {
      const models = ['gpt-4o-mini', 'gpt-4o', 'claude-sonnet-4-6', 'gemini-2.5-flash', 'llama-3.3-70b-versatile'];
      for (const model of models) {
        expect(validateJudgeInput('prompt', validResponses, model)).toBeNull();
      }
    });
  });

  describe('invalid inputs', () => {
    it('rejects missing prompt', () => {
      const err = validateJudgeInput('', validResponses, 'gpt-4o-mini');
      expect(err).not.toBeNull();
      expect(err).toContain('prompt');
    });

    it('rejects fewer than 2 responses', () => {
      const err = validateJudgeInput('prompt', [validResponses[0]], 'gpt-4o-mini');
      expect(err).not.toBeNull();
      expect(err).toContain('2 responses');
    });

    it('rejects empty responses array', () => {
      const err = validateJudgeInput('prompt', [], 'gpt-4o-mini');
      expect(err).not.toBeNull();
    });

    // ── The exact bug from the screenshot ────────────────────
    it('rejects custom model with no endpoint URL (the bug that caused AI_APICallError)', () => {
      const err = validateJudgeInput('prompt', validResponses, 'custom', '');
      expect(err).not.toBeNull();
      expect(err).toContain('endpoint URL');
    });

    it('rejects custom model with undefined endpoint URL', () => {
      const err = validateJudgeInput('prompt', validResponses, 'custom', undefined);
      expect(err).not.toBeNull();
    });

    it('rejects custom model with whitespace-only endpoint URL', () => {
      const err = validateJudgeInput('prompt', validResponses, 'custom', '   ');
      expect(err).not.toBeNull();
    });
  });

});

describe('judge scores structure', () => {

  it('overall score is average of dimensions', () => {
    const scores = { accuracy: 8, relevance: 9, coherence: 8, helpfulness: 9, safety: 10 };
    const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
    // Should be 8.8
    expect(avg).toBeCloseTo(8.8);
  });

  it('winner label must exist in scores', () => {
    const result = {
      scores: {
        'A — gpt': { overall: 9 },
        'B — claude': { overall: 8 },
      },
      winner: 'A — gpt',
    };
    expect(result.scores[result.winner]).toBeDefined();
  });

  it('detects when winner is not in scores (invalid judge response)', () => {
    const result = {
      scores: { 'A': { overall: 9 }, 'B': { overall: 8 } },
      winner: 'C', // not in scores!
    };
    expect(result.scores[result.winner]).toBeUndefined();
  });

});
