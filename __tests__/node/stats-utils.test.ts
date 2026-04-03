// __tests__/node/stats-utils.test.ts
// Tests for avg() and body field parsing.
// NaN in stats crashed the app — this catches it before it ships.

import { avg, sanitizeBodyFieldValue, parseBodyFieldValue } from '../../lib/evalify-utils';

describe('avg', () => {

  describe('normal cases', () => {
    it('averages a simple array', () => {
      expect(avg([1, 2, 3])).toBe(2);
    });

    it('rounds to nearest integer', () => {
      expect(avg([1, 2])).toBe(2); // 1.5 → 2
    });

    it('handles single value', () => {
      expect(avg([42])).toBe(42);
    });

    it('handles large numbers (response times)', () => {
      expect(avg([1200, 3500, 8300])).toBe(4333);
    });
  });

  describe('NaN and null handling (the bug that broke Stats tab)', () => {
    it('returns null for empty array', () => {
      expect(avg([])).toBeNull();
    });

    it('filters out null values', () => {
      expect(avg([10, null, 20])).toBe(15);
    });

    it('filters out undefined values', () => {
      expect(avg([10, undefined, 20])).toBe(15);
    });

    it('filters out NaN values', () => {
      expect(avg([10, NaN, 20])).toBe(15);
    });

    it('returns null when ALL values are NaN/null', () => {
      expect(avg([null, null, NaN])).toBeNull();
    });

    it('handles mixed valid and invalid values', () => {
      // KServe has null tokens, compare panels have real values
      expect(avg([2447, null, 5926, null, NaN, 346])).toBe(2906);
    });

    it('does not return NaN (regression test for Stats crash)', () => {
      // This exact scenario crashed the Stats tab
      const tokens = [null, null, 739, 346, 506, 600]; // KServe has null tokens
      const result = avg(tokens);
      expect(result).not.toBeNaN();
      expect(result).toBe(548); // avg of [739, 346, 506, 600]
    });
  });

});

describe('sanitizeBodyFieldValue', () => {

  describe('strips Value: prefix (the 400 error bug)', () => {
    it('strips "Value: " prefix', () => {
      expect(sanitizeBodyFieldValue('Value: {"trace_id":"evalify-test"}'))
        .toBe('{"trace_id":"evalify-test"}');
    });

    it('strips "value: " prefix (lowercase)', () => {
      expect(sanitizeBodyFieldValue('value: something'))
        .toBe('something');
    });

    it('strips "VALUE: " prefix (uppercase)', () => {
      expect(sanitizeBodyFieldValue('VALUE: something'))
        .toBe('something');
    });

    it('does NOT strip Value from the middle of a string', () => {
      expect(sanitizeBodyFieldValue('{"key":"Value: inside"}'))
        .toBe('{"key":"Value: inside"}');
    });

    it('leaves clean value unchanged', () => {
      expect(sanitizeBodyFieldValue('{"trace_id":"evalify-test"}'))
        .toBe('{"trace_id":"evalify-test"}');
    });

    it('leaves X-Allow-Routing unchanged', () => {
      expect(sanitizeBodyFieldValue('hybrid')).toBe('hybrid');
    });
  });

  describe('edge cases', () => {
    it('handles empty string', () => {
      expect(sanitizeBodyFieldValue('')).toBe('');
    });

    it('handles null/undefined gracefully', () => {
      expect(sanitizeBodyFieldValue(null as any)).toBe('');
      expect(sanitizeBodyFieldValue(undefined as any)).toBe('');
    });

    it('trims whitespace', () => {
      expect(sanitizeBodyFieldValue('  hello  ')).toBe('hello');
    });
  });

});

describe('parseBodyFieldValue', () => {

  it('parses valid JSON object', () => {
    expect(parseBodyFieldValue('{"trace_id":"evalify-test"}'))
      .toEqual({ trace_id: 'evalify-test' });
  });

  it('parses valid JSON number', () => {
    expect(parseBodyFieldValue('42')).toBe(42);
  });

  it('parses valid JSON boolean', () => {
    expect(parseBodyFieldValue('true')).toBe(true);
  });

  it('falls back to string for non-JSON', () => {
    expect(parseBodyFieldValue('hybrid')).toBe('hybrid');
  });

  it('strips Value: prefix before parsing', () => {
    // This is the exact bug that caused HTTP 400
    expect(parseBodyFieldValue('Value: {"trace_id":"evalify-test"}'))
      .toEqual({ trace_id: 'evalify-test' });
  });

  it('handles empty string', () => {
    expect(parseBodyFieldValue('')).toBe('');
  });

});
