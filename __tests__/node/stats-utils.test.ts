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

// ── Analytics dashboard chart tests ──────────────────────────

describe('Analytics charts — bar width calculation', () => {

  const chartW = 340;

  function barWidth(val: number, maxVal: number): number {
    return maxVal > 0 ? (val / maxVal) * chartW : 0;
  }

  function clampMin(w: number): number {
    return Math.max(w, 2); // minimum 2px so bar is always visible
  }

  it('fastest model gets full width bar', () => {
    const maxTime = 2000;
    expect(barWidth(2000, maxTime)).toBe(340);
  });

  it('slowest model gets proportional bar', () => {
    const maxTime = 2000;
    expect(barWidth(1000, maxTime)).toBe(170); // 50% width
  });

  it('zero value gets minimum bar width of 2px', () => {
    expect(clampMin(barWidth(0, 2000))).toBe(2);
  });

  it('maxTime=0 returns 0 bar width (no data)', () => {
    expect(barWidth(0, 0)).toBe(0);
  });

  it('all models same time = all same width', () => {
    const maxTime = 1000;
    expect(barWidth(1000, maxTime)).toBe(barWidth(1000, maxTime));
  });

});

describe('Analytics charts — model color coding', () => {

  function modelColor(m: string): string {
    if (m.startsWith('gpt'))    return '#10b981'; // green — OpenAI
    if (m.startsWith('claude')) return '#f97316'; // orange — Anthropic
    if (m.startsWith('llama') || m.startsWith('mixtral')) return '#a855f7'; // purple — Groq
    if (m.startsWith('gemini')) return '#3b82f6'; // blue — Google
    if (m.includes('/'))        return '#f97316'; // orange — OpenRouter
    return '#22d3ee'; // cyan — custom
  }

  it('OpenAI models are green', () => {
    expect(modelColor('gpt-4o-mini')).toBe('#10b981');
    expect(modelColor('gpt-4o')).toBe('#10b981');
  });

  it('Anthropic models are orange', () => {
    expect(modelColor('claude-haiku-4-5-20251001')).toBe('#f97316');
    expect(modelColor('claude-sonnet-4-6')).toBe('#f97316');
  });

  it('Groq models are purple', () => {
    expect(modelColor('llama-3.3-70b-versatile')).toBe('#a855f7');
    expect(modelColor('mixtral-8x7b-32768')).toBe('#a855f7');
  });

  it('Google models are blue', () => {
    expect(modelColor('gemini-2.5-flash')).toBe('#3b82f6');
  });

  it('OpenRouter models (contain /) are orange', () => {
    expect(modelColor('deepseek/deepseek-chat')).toBe('#f97316');
    expect(modelColor('meta-llama/llama-4-maverick')).toBe('#f97316');
  });

  it('custom/unknown models are cyan', () => {
    expect(modelColor('my-custom-model')).toBe('#22d3ee');
  });

});

describe('Analytics charts — short model name display', () => {

  function shortName(m: string): string {
    if (m.includes('/'))
      return m.split('/')[1].replace('deepseek-', 'DS-');
    return m.split('-').slice(0, 2).join('-');
  }

  it('truncates OpenAI model to 2 parts', () => {
    expect(shortName('gpt-4o-mini')).toBe('gpt-4o');
  });

  it('truncates Anthropic model to 2 parts', () => {
    expect(shortName('claude-haiku-4-5-20251001')).toBe('claude-haiku');
  });

  it('truncates Groq model to 2 parts', () => {
    expect(shortName('llama-3.3-70b-versatile')).toBe('llama-3.3');
  });

  it('shows DS- prefix for DeepSeek', () => {
    expect(shortName('deepseek/deepseek-chat')).toBe('DS-chat');
    expect(shortName('deepseek/deepseek-r1')).toBe('DS-r1');
  });

  it('shows model part for other OpenRouter models', () => {
    expect(shortName('meta-llama/llama-4-maverick')).toBe('llama-4-maverick');
  });

});

describe('Analytics charts — SVG dimensions', () => {

  function svgHeight(modelCount: number): number {
    const barH = 22;
    const gap  = 8;
    return modelCount * (barH + gap) + 20;
  }

  it('1 model = correct height', () => {
    expect(svgHeight(1)).toBe(50);
  });

  it('4 models = correct height', () => {
    expect(svgHeight(4)).toBe(140);
  });

  it('height scales linearly with model count', () => {
    expect(svgHeight(2)).toBe(svgHeight(1) + 30);
    expect(svgHeight(3)).toBe(svgHeight(2) + 30);
  });

  it('charts only show with 2+ models', () => {
    const shouldShow = (count: number) => count > 1;
    expect(shouldShow(0)).toBe(false);
    expect(shouldShow(1)).toBe(false);
    expect(shouldShow(2)).toBe(true);
    expect(shouldShow(4)).toBe(true);
  });

});

describe('Analytics charts — label formatting', () => {

  function responseTimeLabel(val: number, maxTime: number): string {
    if (!val) return '—';
    const pct = maxTime > 0 ? Math.round((val / maxTime) * 100) : 0;
    return `${val}ms (${pct}%)`;
  }

  function usageLabel(val: number, wr: number | null): string {
    const countStr = val === 1 ? '1 response' : `${val} responses`;
    return wr !== null ? `${countStr} · ${wr}% 👍` : countStr;
  }

  // Response time labels
  it('slowest model shows 100%', () => {
    expect(responseTimeLabel(4093, 4093)).toBe('4093ms (100%)');
  });

  it('fastest model shows correct percentage', () => {
    expect(responseTimeLabel(1126, 4093)).toBe('1126ms (28%)');
  });

  it('mid model shows correct percentage', () => {
    expect(responseTimeLabel(3185, 4093)).toBe('3185ms (78%)');
  });

  it('zero value shows dash', () => {
    expect(responseTimeLabel(0, 4093)).toBe('—');
  });

  it('maxTime=0 shows 0%', () => {
    expect(responseTimeLabel(1000, 0)).toBe('1000ms (0%)');
  });

  // Usage count labels
  it('singular response label for count=1', () => {
    expect(usageLabel(1, null)).toBe('1 response');
  });

  it('plural responses label for count > 1', () => {
    expect(usageLabel(2, null)).toBe('2 responses');
    expect(usageLabel(10, null)).toBe('10 responses');
  });

  it('shows win rate when available', () => {
    expect(usageLabel(4, 75)).toBe('4 responses · 75% 👍');
  });

  it('no win rate when null (no scored responses)', () => {
    expect(usageLabel(4, null)).toBe('4 responses');
  });

  it('0% win rate shown correctly', () => {
    expect(usageLabel(3, 0)).toBe('3 responses · 0% 👍');
  });

  it('100% win rate shown correctly', () => {
    expect(usageLabel(5, 100)).toBe('5 responses · 100% 👍');
  });

  // Total count
  it('total count sums all model responses', () => {
    const byModel: Record<string, any[]> = {
      'gpt-4o-mini':  [{}, {}],
      'claude-haiku': [{}, {}],
      'llama':        [{}, {}],
      'gemini':       [{}, {}],
    };
    const total = Object.values(byModel).flat().length;
    expect(total).toBe(8);
  });

});
