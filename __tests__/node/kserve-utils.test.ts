// __tests__/node/kserve-utils.test.ts
// Tests for KServe URL handling and template substitution.
// stripV1Suffix broke in production — this prevents regression.

import { stripV1Suffix, fillKServeTemplate } from '../../lib/evalify-utils';

describe('stripV1Suffix', () => {

  describe('strips /v1 from URL', () => {
    it('strips trailing /v1', () => {
      expect(stripV1Suffix('https://mlserver.company.com/v1'))
        .toBe('https://mlserver.company.com');
    });

    it('strips trailing /v1/ with slash', () => {
      expect(stripV1Suffix('https://mlserver.company.com/v1/'))
        .toBe('https://mlserver.company.com');
    });

    it('does NOT strip /v1 from middle of path', () => {
      expect(stripV1Suffix('https://mlserver.company.com/v1/something'))
        .toBe('https://mlserver.company.com/v1/something');
    });
  });

  describe('leaves correct KServe URLs unchanged', () => {
    it('leaves URL without /v1 unchanged', () => {
      expect(stripV1Suffix('https://mlserver.company.com'))
        .toBe('https://mlserver.company.com');
    });

    it('strips only trailing slash', () => {
      expect(stripV1Suffix('https://mlserver.company.com/'))
        .toBe('https://mlserver.company.com');
    });

    it('handles localhost URLs', () => {
      expect(stripV1Suffix('http://localhost:8080'))
        .toBe('http://localhost:8080');
    });

    it('handles localhost with /v1', () => {
      expect(stripV1Suffix('http://localhost:8080/v1'))
        .toBe('http://localhost:8080');
    });
  });

  describe('real-world production URL (the one that broke)', () => {
    const productionUrl = 'https://ml-inference.internal.company.com/v1';

    it('strips /v1 so KServe path is correct', () => {
      const base = stripV1Suffix(productionUrl);
      const inferUrl = `${base}/v2/models/llm_generic_large_v2/infer`;
      expect(inferUrl).toBe(
        'https://ml-inference.internal.company.com/v2/models/llm_generic_large_v2/infer'
      );
      // Confirm it does NOT have /v1/v2/...
      expect(inferUrl).not.toContain('/v1/v2/');
    });
  });

});

describe('fillKServeTemplate', () => {

  const simpleTemplate = '{"id":"42","inputs":[{"name":"request","data":["{{query}}"]}]}';

  describe('basic substitution', () => {
    it('replaces {{query}} with the query text', () => {
      const result = fillKServeTemplate(simpleTemplate, 'What is AI?', '12345');
      expect(result).toContain('What is AI?');
      expect(result).not.toContain('{{query}}');
    });

    it('replaces {{timestamp}} with provided timestamp', () => {
      const template = '{"trace_id":"evalify-{{timestamp}}"}';
      const result = fillKServeTemplate(template, 'hello', '99999');
      expect(result).toContain('evalify-99999');
      expect(result).not.toContain('{{timestamp}}');
    });

    it('uses current timestamp when not provided', () => {
      const template = '{"trace_id":"{{timestamp}}"}';
      const before = Date.now();
      const result = fillKServeTemplate(template, 'hello');
      const after = Date.now();
      const ts = parseInt(JSON.parse(result).trace_id);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('special character escaping', () => {
    it('escapes double quotes in query', () => {
      const result = fillKServeTemplate(simpleTemplate, 'Say "hello"', '0');
      // Should be valid JSON after filling
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('escapes backslashes in query', () => {
      const result = fillKServeTemplate(simpleTemplate, 'path\\to\\file', '0');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('escapes newlines in query', () => {
      const result = fillKServeTemplate(simpleTemplate, 'line1\nline2', '0');
      expect(() => JSON.parse(result)).not.toThrow();
      expect(result).toContain('\\n');
    });

    it('handles query with all special chars', () => {
      const messy = 'He said "hi"\nWith a backslash\\\tand a tab';
      const result = fillKServeTemplate(simpleTemplate, messy, '0');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('multiple occurrences', () => {
    it('replaces all {{query}} occurrences', () => {
      const template = '{"a":"{{query}}","b":"{{query}}"}';
      const result = fillKServeTemplate(template, 'test', '0');
      expect(result).toBe('{"a":"test","b":"test"}');
    });
  });

});
