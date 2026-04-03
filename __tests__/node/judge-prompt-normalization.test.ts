// __tests__/node/judge-prompt-normalization.test.ts
// Tests for judge same-question enforcement.
// Bug: custom endpoint + KServe responses couldn't be judged with compare
// panel responses because prompt strings differed slightly between tabs.

import { normalizePrompt, isSamePrompt, groupByPrompt } from '../../lib/evalify-utils';

describe('normalizePrompt', () => {

  it('trims leading whitespace', () => {
    expect(normalizePrompt('  What is AI?')).toBe('what is ai?');
  });

  it('trims trailing whitespace', () => {
    expect(normalizePrompt('What is AI?  ')).toBe('what is ai?');
  });

  it('lowercases the prompt', () => {
    expect(normalizePrompt('What Is AI?')).toBe('what is ai?');
  });

  it('trims AND lowercases', () => {
    expect(normalizePrompt('  What Is AI?  ')).toBe('what is ai?');
  });

  it('handles empty string', () => {
    expect(normalizePrompt('')).toBe('');
  });

  it('handles null/undefined gracefully', () => {
    expect(normalizePrompt(null as any)).toBe('');
    expect(normalizePrompt(undefined as any)).toBe('');
  });

  it('preserves punctuation and numbers', () => {
    expect(normalizePrompt('What are the 3 key principles?'))
      .toBe('what are the 3 key principles?');
  });

});

describe('isSamePrompt', () => {

  // ── The exact bug: same question from different tabs ──────
  describe('same question from different tabs (real-world bug)', () => {
    it('matches when compare panel stored trimmed, custom endpoint had trailing space', () => {
      // Compare panel: user pressed Enter, question stored trimmed
      const comparePrompt = 'i am having headache can you help?';
      // Custom endpoint: broadcast input stored with trailing whitespace
      const customPrompt = 'i am having headache can you help? ';
      expect(isSamePrompt(comparePrompt, customPrompt)).toBe(true);
    });

    it('matches when one tab stored different case', () => {
      expect(isSamePrompt(
        'Explain microservices architecture',
        'explain microservices architecture'
      )).toBe(true);
    });

    it('matches with both leading and trailing whitespace differences', () => {
      expect(isSamePrompt(
        '  What is a Large Language Model?  ',
        'What is a Large Language Model?'
      )).toBe(true);
    });

    it('matches KServe broadcast vs compare panel prompt', () => {
      // Both should be treated as same question
      expect(isSamePrompt(
        'Explain prompt engineering best practices',
        'Explain prompt engineering best practices'
      )).toBe(true);
    });
  });

  // ── Should NOT match — genuinely different questions ──────
  describe('different questions (should NOT match)', () => {
    it('rejects different questions', () => {
      expect(isSamePrompt(
        'What is microservices?',
        'What is machine learning?'
      )).toBe(false);
    });

    it('rejects Q1 from compare vs Q2 from KServe', () => {
      expect(isSamePrompt(
        'How does a neural network learn?',
        'Explain microservices architecture'
      )).toBe(false);
    });

    it('rejects empty vs non-empty', () => {
      expect(isSamePrompt('', 'something')).toBe(false);
    });

    it('rejects partial matches', () => {
      expect(isSamePrompt('What is AI?', 'What is AI and ML?')).toBe(false);
    });
  });

  // ── Symmetric ─────────────────────────────────────────────
  it('is symmetric — order does not matter', () => {
    const a = 'What is AI?  ';
    const b = '  What is AI?';
    expect(isSamePrompt(a, b)).toBe(isSamePrompt(b, a));
  });

});

describe('groupByPrompt', () => {

  const makeEntry = (question: string, id: string) => ({ id, question });

  it('groups identical questions together', () => {
    const entries = [
      makeEntry('What is AI?', '1'),
      makeEntry('What is AI?', '2'),
      makeEntry('What is ML?', '3'),
    ];
    const groups = groupByPrompt(entries);
    expect(groups.get('What is AI?')).toHaveLength(2);
    expect(groups.get('What is ML?')).toHaveLength(1);
  });

  it('groups trimmed variants under same key', () => {
    const entries = [
      makeEntry('What is AI?', '1'),    // compare panel
      makeEntry('What is AI? ', '2'),   // custom endpoint with trailing space
    ];
    const groups = groupByPrompt(entries);
    // Both should be under "What is AI?" (trimmed key)
    expect(groups.get('What is AI?')).toHaveLength(2);
  });

  it('returns empty map for empty input', () => {
    expect(groupByPrompt([])).toEqual(new Map());
  });

  it('puts responses from all 6 tabs in same group when same question', () => {
    // Simulates: 4 compare panels + custom endpoint + KServe all asked same question
    const entries = [
      makeEntry('Explain microservices', 'panel-A'),   // compare A (GPT)
      makeEntry('Explain microservices', 'panel-B'),   // compare B (Claude)
      makeEntry('Explain microservices', 'panel-C'),   // compare C (Llama)
      makeEntry('Explain microservices', 'panel-D'),   // compare D (Gemini)
      makeEntry('Explain microservices', 'custom-1'),  // custom endpoint
      makeEntry('Explain microservices', 'kserve-1'),  // KServe v2
    ];
    const groups = groupByPrompt(entries);
    expect(groups.get('Explain microservices')).toHaveLength(6);
  });

  it('preserves display text (not lowercased key)', () => {
    // Keys should be trimmed but preserve original case for display
    const entries = [makeEntry('What Is AI?', '1')];
    const groups = groupByPrompt(entries);
    expect(groups.has('What Is AI?')).toBe(true);
  });

});
