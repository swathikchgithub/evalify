// __tests__/node/extractNestedContent.test.ts
// Tests for the double-encoded JSON extraction from internal LLM servers.
// This function broke silently 3 times during development — hence the thorough suite.

import { extractNestedContent } from '../../lib/evalify-utils';

describe('extractNestedContent', () => {

  // ── The actual format this server returns ──────────────────
  describe('double-encoded server format (real-world)', () => {
    it('extracts model_output from fully nested response', () => {
      // This is the double-encoded format returned by some internal LLM servers
      const serverContent = JSON.stringify({
        response: JSON.stringify({ model_output: 'Hello! How can I help you today?' }),
        response_metadata: JSON.stringify({ trace_id: 'evalify-test' }),
        error: null,
      });

      expect(extractNestedContent(serverContent)).toBe('Hello! How can I help you today?');
    });

    it('extracts long markdown response correctly', () => {
      const longText = '# Microservices\n\n## Core Concept\nMicroservices decompose applications.';
      const serverContent = JSON.stringify({
        response: JSON.stringify({ model_output: longText }),
      });

      expect(extractNestedContent(serverContent)).toBe(longText);
    });

    it('extracts model_output with special characters', () => {
      const text = 'Use "quotes" and \\backslashes\\ and\nnewlines';
      const serverContent = JSON.stringify({
        response: JSON.stringify({ model_output: text }),
      });

      expect(extractNestedContent(serverContent)).toBe(text);
    });
  });

  // ── Simpler nested formats ─────────────────────────────────
  describe('single-level nesting', () => {
    it('extracts from { model_output: "..." }', () => {
      expect(extractNestedContent('{"model_output":"Direct output"}')).toBe('Direct output');
    });

    it('extracts from { response: "plain text" }', () => {
      expect(extractNestedContent('{"response":"Plain text response"}')).toBe('Plain text response');
    });

    it('extracts from { text: "..." }', () => {
      expect(extractNestedContent('{"text":"Text field value"}')).toBe('Text field value');
    });

    it('extracts from { answer: "..." }', () => {
      expect(extractNestedContent('{"answer":"Answer field value"}')).toBe('Answer field value');
    });

    it('extracts from { content: "..." }', () => {
      expect(extractNestedContent('{"content":"Content field value"}')).toBe('Content field value');
    });
  });

  // ── Plain text pass-through ────────────────────────────────
  describe('plain text (no unwrapping needed)', () => {
    it('returns plain text unchanged', () => {
      expect(extractNestedContent('Hello world')).toBe('Hello world');
    });

    it('returns markdown unchanged', () => {
      const md = '# Title\n\n- Item 1\n- Item 2';
      expect(extractNestedContent(md)).toBe(md);
    });

    it('returns text with quotes unchanged', () => {
      expect(extractNestedContent('Say "hello"')).toBe('Say "hello"');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────
  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(extractNestedContent('')).toBe('');
    });

    it('handles null gracefully', () => {
      expect(extractNestedContent(null as any)).toBe('');
    });

    it('handles undefined gracefully', () => {
      expect(extractNestedContent(undefined as any)).toBe('');
    });

    it('returns raw string for malformed JSON', () => {
      expect(extractNestedContent('{not valid json')).toBe('{not valid json');
    });

    it('returns JSON string as-is when no known fields', () => {
      const obj = '{"unknown_field":"value","other":123}';
      // No known extraction field — returns raw
      expect(extractNestedContent(obj)).toBe(obj);
    });

    it('handles JSON with null response field', () => {
      expect(extractNestedContent('{"response":null}')).toBe('{"response":null}');
    });
  });

});
