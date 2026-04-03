// config/endpoints.ts
// ─────────────────────────────────────────────────────────────
// Team endpoint configuration for Evalify.
// This file is committed to the repo — do NOT put API keys here.
// API keys go in .env.local (see .env.local.example)
//
// Usage:
//   - Custom Endpoint tab → "Team Endpoints" dropdown
//   - KServe v2 tab       → "Team Endpoints" dropdown
//   - One click loads the full config into the form
// ─────────────────────────────────────────────────────────────

export interface EndpointConfig {
  name: string;          // Display name in dropdown
  url: string;           // Base URL (no trailing slash)
  model?: string;        // Model name (optional)
  skipSsl?: boolean;     // Skip SSL verification
  authType?: 'bearer' | 'header';
  // Header key to read API key from .env.local
  // e.g. 'CUSTOM_ENDPOINT_API_KEY' → reads process.env.CUSTOM_ENDPOINT_API_KEY
  apiKeyEnvVar?: string;
  headers?: { key: string; value: string }[];
  bodyFields?: { key: string; value: string }[];
  description?: string;
}

export interface KServeEndpointConfig {
  name: string;
  url: string;
  skipSsl?: boolean;
  authType?: 'bearer' | 'header';
  apiKeyEnvVar?: string;
  headers?: { key: string; value: string }[];
  description?: string;
}

// ── OpenAI-Compatible Endpoints ───────────────────────────────
// Add your custom OpenAI-compatible endpoints here.
// These appear in the "Team Endpoints" dropdown in Custom Endpoint tab.

export const CUSTOM_ENDPOINTS: EndpointConfig[] = [
  {
    name: 'LLM Generic Large',
    url: 'https://your-ml-inference-server.com/v1',
    model: 'llm_generic_large',
    skipSsl: true,
    authType: 'bearer',
    apiKeyEnvVar: 'CUSTOM_ENDPOINT_API_KEY', // optional
    headers: [
      { key: 'X-Allow-Routing', value: 'hybrid' },
    ],
    bodyFields: [
      { key: 'request_metadata', value: '{"trace_id":"evalify-test"}' },
    ],
    description: 'Internal LLM Generic Large model',
  },
  {
    name: 'LLM Generic Large v2',
    url: 'https://your-ml-inference-server.com/v1',
    model: 'llm_generic_large_v2',
    skipSsl: true,
    headers: [
      { key: 'X-Allow-Routing', value: 'hybrid' },
    ],
    bodyFields: [
      { key: 'request_metadata', value: '{"trace_id":"evalify-test"}' },
    ],
    description: 'Internal LLM Generic Large v2',
  },
  {
    name: 'LLM Small Moderations',
    url: 'https://your-ml-inference-server.com/v1',
    model: 'llm_generic_small_moderations',
    skipSsl: true,
    headers: [
      { key: 'X-Allow-Routing', value: 'hybrid' },
    ],
    bodyFields: [
      { key: 'request_metadata', value: '{"trace_id":"evalify-test"}' },
    ],
    description: 'Moderation model — returns safety/security JSON',
  },
  {
    name: 'Local Ollama (Llama3)',
    url: 'http://localhost:11434/v1',
    model: 'llama3',
    skipSsl: false,
    headers: [],
    bodyFields: [],
    description: 'Local Ollama server',
  },
  {
    name: 'Local vLLM',
    url: 'http://localhost:8000/v1',
    model: 'your-model',
    skipSsl: false,
    headers: [],
    bodyFields: [],
    description: 'Local vLLM server',
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3-8b-instruct',
    authType: 'bearer',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    headers: [],
    bodyFields: [],
    description: 'OpenRouter — access 100+ models',
  },
  {
    name: 'Together AI',
    url: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3-8b-chat-hf',
    authType: 'bearer',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    headers: [],
    bodyFields: [],
    description: 'Together AI inference',
  },
];

// ── KServe v2 Endpoints ───────────────────────────────────────
// Add your KServe inference servers here.
// These appear in the "Team Endpoints" dropdown in KServe v2 tab.

export const KSERVE_ENDPOINTS: KServeEndpointConfig[] = [
  {
    name: 'ML Prediction Server',
    url: 'https://your-ml-inference-server.com',
    skipSsl: true,
    authType: 'bearer',
    headers: [
      { key: 'X-Allow-Routing', value: 'hybrid' },
    ],
    description: 'Main KServe inference server',
  },
  {
    name: 'ML Prediction Server (Dev)',
    url: 'https://your-ml-inference-dev-server.com',
    skipSsl: true,
    headers: [
      { key: 'X-Allow-Routing', value: 'hybrid' },
    ],
    description: 'Dev/staging KServe server',
  },
];
