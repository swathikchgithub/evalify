// __tests__/node/provider-utils.test.ts
// Tests for model provider detection and routing.

import { getProviderInfo } from '../../lib/evalify-utils';

describe('getProviderInfo', () => {

  describe('OpenAI models', () => {
    it('identifies gpt-4o-mini', () => {
      const info = getProviderInfo('gpt-4o-mini');
      expect(info.name).toBe('OpenAI');
      expect(info.badge).toBe('badge-openai');
    });

    it('identifies gpt-4o', () => {
      expect(getProviderInfo('gpt-4o').name).toBe('OpenAI');
    });

    it('identifies gpt-3.5-turbo', () => {
      expect(getProviderInfo('gpt-3.5-turbo').name).toBe('OpenAI');
    });

    it('identifies o1 series', () => {
      expect(getProviderInfo('o1-preview').name).toBe('OpenAI');
    });

    it('identifies o3 series', () => {
      expect(getProviderInfo('o3-mini').name).toBe('OpenAI');
    });
  });

  describe('Anthropic models', () => {
    it('identifies claude-haiku', () => {
      const info = getProviderInfo('claude-haiku-4-5-20251001');
      expect(info.name).toBe('Anthropic');
      expect(info.badge).toBe('badge-anthropic');
    });

    it('identifies claude-sonnet', () => {
      expect(getProviderInfo('claude-sonnet-4-6').name).toBe('Anthropic');
    });

    it('identifies any claude model', () => {
      expect(getProviderInfo('claude-3-opus-20240229').name).toBe('Anthropic');
    });
  });

  describe('Groq models', () => {
    it('identifies llama models', () => {
      const info = getProviderInfo('llama-3.3-70b-versatile');
      expect(info.name).toBe('Groq');
      expect(info.badge).toBe('badge-groq');
    });

    it('identifies mixtral models', () => {
      expect(getProviderInfo('mixtral-8x7b-32768').name).toBe('Groq');
    });
  });

  describe('Google models', () => {
    it('identifies gemini models', () => {
      const info = getProviderInfo('gemini-2.5-flash');
      expect(info.name).toBe('Google');
      expect(info.badge).toBe('badge-google');
    });

    it('identifies gemini lite models', () => {
      expect(getProviderInfo('gemini-2.5-flash-lite').name).toBe('Google');
    });
  });

  describe('Custom/unknown models', () => {
    it('returns Custom for internal model names', () => {
      expect(getProviderInfo('llm_generic_large').name).toBe('Custom');
      expect(getProviderInfo('llm_generic_large_v2').name).toBe('Custom');
      expect(getProviderInfo('code_assist_v2').name).toBe('Custom');
    });

    it('returns Custom for unknown models', () => {
      expect(getProviderInfo('some-unknown-model').name).toBe('Custom');
    });

    it('returns Custom for empty string', () => {
      expect(getProviderInfo('').name).toBe('Custom');
    });
  });

});
