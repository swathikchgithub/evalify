// config/models.ts  (save as config/models.ts in your project)
// Single Responsibility: model lists, pricing, complexity, prompts.
// Open/Closed: add a new model by extending the array — no existing code changes.

// ── Compare panel models ───────────────────────────────────────
export const MODELS = [
  { value: 'gpt-4o-mini',               label: 'GPT-4o Mini (OpenAI)'           },
  { value: 'gpt-4o',                    label: 'GPT-4o (OpenAI)'                },
  { value: 'gpt-3.5-turbo',             label: 'GPT-3.5 Turbo (OpenAI)'         },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (Anthropic)'       },
  { value: 'claude-sonnet-4-6',         label: 'Claude Sonnet (Anthropic)'      },
  { value: 'llama-3.3-70b-versatile',   label: 'Llama 3.3 70B (Groq)'           },
  { value: 'mixtral-8x7b-32768',        label: 'Mixtral 8x7B (Groq)'            },
  { value: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash (Google)'      },
  { value: 'gemini-2.5-flash-lite',       label: 'Gemini 2.5 Flash Lite (Google)'     },
  { value: 'deepseek/deepseek-chat',       label: 'DeepSeek V3 (OpenRouter)'          },
  { value: 'deepseek/deepseek-r1',         label: 'DeepSeek R1 Reasoner (OpenRouter)' },
  { value: 'meta-llama/llama-4-maverick',  label: 'Llama 4 Maverick (OpenRouter)'     },
  { value: 'google/gemini-2.5-pro',        label: 'Gemini 2.5 Pro (OpenRouter)'       },
  { value: 'openai/gpt-oss-120b:free',     label: 'GPT-OSS 120B (OpenRouter)'         },
  { value: 'openai/gpt-oss-20b:free',      label: 'GPT-OSS 20B (OpenRouter)'          },
  { value: 'google/gemma-4-31b-it',        label: 'Gemma 4 31B (OpenRouter)'          },
  { value: 'google/gemma-4-26b-a4b-it',    label: 'Gemma 4 26B MoE (OpenRouter)'      },
];

export const DEFAULT_PANEL_MODELS = {
  A: 'gpt-4o-mini',
  B: 'claude-haiku-4-5-20251001',
  C: 'llama-3.3-70b-versatile',
  D: 'gemini-2.5-flash',
} as const;

// ── Judge models ───────────────────────────────────────────────
export const JUDGE_MODELS = [
  { value: 'gpt-4o-mini',             label: 'GPT-4o Mini — Fast & cheap',      badge: '⚡' },
  { value: 'gpt-4o',                  label: 'GPT-4o — Most accurate',           badge: '🎯' },
  { value: 'claude-sonnet-4-6',       label: 'Claude Sonnet — Nuanced',          badge: '🧠' },
  { value: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash — Balanced',      badge: '✨' },
  { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — Open source',      badge: '🦙' },
  { value: 'deepseek/deepseek-chat',    label: 'DeepSeek V3 — Fast & cheap',        badge: '🐋' },
  { value: 'deepseek/deepseek-r1',      label: 'DeepSeek R1 — Reasoning',           badge: '🧠' },
  { value: 'openai/gpt-oss-120b:free',  label: 'GPT-OSS 120B — Free & powerful',    badge: '🔓' },
  { value: 'google/gemma-4-31b-it',     label: 'Gemma 4 31B — Open source',         badge: '💎' },
  { value: 'custom',                    label: 'Custom Endpoint — Your own model',   badge: '🔌' },
];

// ── Known internal model names for custom judge endpoint ───────
export const KNOWN_CUSTOM_MODELS = [
  { value: 'gpt-4o-mini',          label: '⚡ gpt-4o-mini'                   },
  { value: 'gpt-4o',               label: '🎯 gpt-4o'                        },
  { value: 'deepseek/deepseek-chat',label: '🐋 deepseek-chat (OpenRouter)'   },
  { value: 'custom',               label: '✏️ Enter custom model name...'    },
];

// ── Model pricing ($ per token) ───────────────────────────────
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini':               { input: 0.00000015,  output: 0.0000006   },
  'gpt-4o':                    { input: 0.0000025,   output: 0.00001     },
  'gpt-3.5-turbo':             { input: 0.0000005,   output: 0.0000015   },
  'claude-haiku-4-5-20251001': { input: 0.00000025,  output: 0.00000125  },
  'claude-sonnet-4-6':         { input: 0.000003,    output: 0.000015    },
  'llama-3.3-70b-versatile':   { input: 0.00000059,  output: 0.00000079  },
  'mixtral-8x7b-32768':        { input: 0.00000024,  output: 0.00000024  },
  'gemini-2.5-flash':          { input: 0.0000001,   output: 0.0000004   },
  'gemini-2.5-flash-lite':          { input: 0.00000005,   output: 0.0000002    },
  'deepseek/deepseek-chat':         { input: 0.00000028,   output: 0.00000042   },
  'deepseek/deepseek-r1':           { input: 0.00000055,   output: 0.00000219   },
  'openai/gpt-oss-120b:free':        { input: 0,             output: 0             },
  'openai/gpt-oss-20b:free':         { input: 0,             output: 0             },
  'google/gemma-4-31b-it':           { input: 0.00000014,    output: 0.00000040    },
  'google/gemma-4-26b-a4b-it':       { input: 0.00000013,    output: 0.00000040    },
  'meta-llama/llama-4-maverick':    { input: 0.0000004,    output: 0.0000004    },
  'google/gemini-2.5-pro':          { input: 0.00000125,   output: 0.00001      },
};

// ── Complexity ────────────────────────────────────────────────
export const DEFAULT_COMPLEXITY = 1; // Age 5 — most approachable

export const COMPLEXITY_LABELS: Record<number, string> = {
  1: '👶 Age 5',
  2: '🧒 Middle School',
  3: '🧑 High School',
  4: '🎓 College',
  5: '🔬 Expert',
};

export const COMPLEXITY_MAP: Record<number, string> = {
  1: 'Explain like I am 5 years old. Use simple words, short sentences, and fun analogies.',
  2: 'Explain like I am in middle school. Use everyday language with some basic terms.',
  3: 'Explain like I am in high school. You can use some technical terms but keep it clear.',
  4: 'Explain like I am a college student. Use proper terminology and go into some depth.',
  5: 'Explain like I am an expert in the field. Be precise, technical, and thorough.',
};

// ── System prompt presets ─────────────────────────────────────
export const PROMPT_PRESETS = [
  { label: 'Select a preset...', value: '' },
  { label: '🎯 Concise Bullets',       value: 'You are a concise assistant. Answer in 3 bullet points maximum.' },
  { label: '👨‍💻 Senior Engineer',     value: 'You are a senior software engineer. Give precise, technical answers with code examples.' },
  { label: '👩‍🏫 Friendly Teacher',    value: 'You are a friendly teacher explaining to a curious 10-year-old.' },
  { label: '🔬 Skeptical Scientist',   value: 'You are a skeptical scientist. Always mention limitations and uncertainties.' },
  { label: '📖 Storyteller',           value: 'You are a master storyteller. Turn every explanation into a short engaging story.' },
  { label: '💼 Business Executive',    value: 'You are a C-suite executive. Give answers in terms of business impact and ROI.' },
  { label: '🧪 Custom prompt...',      value: 'custom' },
];

// ── localStorage keys ─────────────────────────────────────────
export const STORAGE_KEY_QUERIES = 'evalify-recent-queries';
export const STORAGE_KEY_CONFIGS  = 'evalify-saved-configs';
export const MAX_RECENT_QUERIES   = 10;
