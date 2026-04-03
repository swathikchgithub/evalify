# ⚡ Evalify — LLM Evaluation Platform

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![Tests](https://img.shields.io/badge/tests-370%2B%20passing-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16.2-black)

> **Compare LLMs side by side · Test any endpoint · Run MT-Bench style evaluations · BYOJ Judge**

Evalify is an open-source, production-grade LLM evaluation tool built with Next.js. Compare public models, test private/internal endpoints (including KServe v2 inference servers), and run AI-powered evaluations using the MT-Bench BYOJ (Bring Your Own Judge) framework.

---

## 🚀 Running the App

### First time setup
```bash
git clone https://github.com/YOUR_USERNAME/evalify.git
cd evalify
npm install
cp .env.local.example .env.local
# Edit .env.local and add your API keys
```

### Daily development
```bash
npm run dev          # ✅ Recommended: runs tests first, then starts server
                     # Server only starts if ALL tests pass
```

### Other run modes

| Command | What it does | When to use |
|---|---|---|
| `npm run dev` | Tests once → start server (blocks on failure) | Normal startup |
| `npm run dev:full` | Server + tests watching simultaneously | Active development |
| `npm run dev:watch` | Tests only, re-run on every file save | Writing tests |
| `npm run dev:server` | Server only, no tests | Emergency bypass |
| `npm test` | Run all tests once | CI / quick check |
| `npm run test:watch` | Tests re-run on every save | TDD workflow |
| `npm run test:coverage` | Tests + coverage report | Before committing |

### How HMR + tests work together

```
You save a file
      │
      ├─► Next.js HMR ──────→ browser updates instantly (no page refresh)
      │
      └─► Jest watch ────────→ re-runs only affected tests (~1 second)
```

Run `npm run dev:full` to get both simultaneously in one terminal.

---

## 🔑 Environment Variables

```env
# .env.local — never commit this file

# Public LLM providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=AI...

# Internal/custom endpoints (optional — referenced in config/endpoints.ts)
CUSTOM_ENDPOINT_API_KEY=
KSERVE_API_KEY=
```

---

## ✨ Features

### ⚡ Compare Models tab
- 4-panel side-by-side: GPT-4o, Claude, Llama, Gemini (all Age 5 complexity by default)
- **Ask All** — sends query to all 4 compare panels simultaneously
- **📡 All** — sends to all 6 endpoints: 4 compare panels + Custom Endpoint + KServe v2
- **🗑 Clear** — clears all 4 panels at once
- **🗑** (per panel) — clears individual panel
- Complexity slider: Age 5 → Expert with system prompt auto-adjustment
- Custom system prompts (7 presets + free-text editor)
- Per-response metrics: response time (ms), token count, cost ($)
- 👍/👎 scoring + win rate tracking in Stats
- ➕ Add to Judge — queue any response for evaluation
- 📋 Copy button per message
- 💡 Sample questions dropdown with recent queries (shared across all tabs)

### 🔌 Custom Endpoint tab
- Test any OpenAI-compatible API (`/v1/chat/completions`)
- SSL skip for self-signed certs (internal servers)
- Custom headers + body fields (pre-populated with `X-Allow-Routing: hybrid`)
- Save/load named configs to localStorage
- Works with: Ollama, vLLM, LM Studio, any internal LLM server, OpenRouter, Together AI

### 🧬 KServe v2 tab
- 18+ model presets for KServe v2 inference servers
- Auto-strips `/v1` suffix from URL to prevent path conflicts
- Custom `{{query}}` template editor
- Covers: LLM chat, moderation, summarization, QA, code, PII detection, embeddings

### ⚖️ Judge tab (BYOJ — Bring Your Own Judge)
- Full-page tab — not a modal, state persists when switching tabs
- Pick judge model: GPT-4o Mini, GPT-4o, Claude Sonnet, Gemini, Llama, or your own endpoint
- Custom endpoint as judge — URL, model dropdown (with known models), Skip SSL checkbox
- 9 evaluation criteria presets: MT-Bench · Code Quality · RAG/QA · Safety · Business · Medical · Legal
- Same-question enforcement (normalized: trim + lowercase) — prevents comparing different prompts
- All Conversations browser — search across all tabs, responses grouped by question
- Results: winner banner, score table (color-coded), score comparison bars
- Auto-saves to localStorage, viewable in Stats → Judge History

### 📊 Stats tab
- Response History: per-model avg time, tokens, cost, win rate
- Judge History: all evaluations with score charts and reasoning
- Full log table with all sessions
- Export CSV (response history + judge history)
- Clear history button

---

## 🏗️ Project Structure

```
evalify/
├── app/
│   ├── api/
│   │   ├── chat/route.ts         ← Compare + Custom Endpoint (https.request for SSL skip)
│   │   ├── kserve/route.ts       ← KServe v2 inference
│   │   ├── judge/route.ts        ← BYOJ Judge (all providers + custom endpoint)
│   │   └── endpoints/route.ts    ← Team endpoint config loader
│   ├── page.tsx                  ← Full UI (5 tabs, ~2200 lines)
│   ├── layout.tsx                ← Title + favicon
│   └── globals.css               ← Dark design system (CSS variables)
├── lib/
│   └── evalify-utils.ts          ← Pure utility functions (testable)
├── config/
│   └── endpoints.ts              ← Team endpoints (commit this, no secrets)
├── __tests__/
│   ├── node/                     ← Jest node environment tests
│   │   ├── extractNestedContent.test.ts
│   │   ├── kserve-utils.test.ts
│   │   ├── stats-utils.test.ts
│   │   ├── provider-utils.test.ts
│   │   ├── judge-prompt-normalization.test.ts
│   │   ├── judge-route.test.ts
│   │   ├── judge-custom-endpoint.test.ts
│   │   ├── compare-panel-actions.test.ts
│   │   └── button-actions.test.ts
│   └── ui/                       ← Jest jsdom environment tests
│       └── recent-queries.test.ts
├── .github/workflows/test.yml    ← CI: tests run on every push
├── jest.config.js
├── .env.local.example
└── package.json
```

---

## 🧪 Tests

```bash
npm test                  # run all tests (currently 290+ tests)
npm run test:watch        # watch mode — re-runs on file save
npm run test:coverage     # with coverage report
```

**What's tested:**

| File | Tests | Covers |
|---|---|---|
| `extractNestedContent` | 12 | Double-encoded JSON from internal LLM server |
| `kserve-utils` | 11 | KServe URL stripping, template substitution |
| `stats-utils` | 14 | NaN safety, body field Value: prefix bug |
| `provider-utils` | 12 | Model routing (OpenAI/Anthropic/Groq/Google) |
| `judge-prompt-normalization` | 21 | Cross-tab same-question enforcement |
| `judge-route` | 35 | Prompt building, JSON parsing, validation |
| `judge-custom-endpoint` | 40+ | SSL config, model dropdown, URL validation |
| `compare-panel-actions` | 73 | Clear, scores, CSV export, complexity, stats |
| `button-actions` | 45+ | Ask All, 📡 All, individual clear, Clear All |
| `recent-queries` | 15 | localStorage, dedup, cross-tab sync |

Every test maps to a **real bug that was caught in production**.

---

## 🔌 Testing Internal Endpoints

### Custom Endpoint (OpenAI-compatible)
```
Tab:           Custom Endpoint
Endpoint URL:  https://your-mlserver.com/v1
Model Name:    llm_generic_large
Skip SSL:      ✅
Extra Headers: X-Allow-Routing → hybrid
Extra Body:    request_metadata → {"trace_id":"evalify-test"}
```

### KServe v2
```
Tab:           KServe v2
Endpoint URL:  https://your-mlserver.com   ← no /v1 needed (auto-stripped)
Model Preset:  Select from 18+ built-in presets
```

### Curl test (verify your endpoint works before configuring)
```bash
curl -k -X POST "https://your-server.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-Allow-Routing: hybrid" \
  -d '{"model":"llm_generic_large","messages":[{"role":"user","content":"hi"}],"stream":false,"request_metadata":{"trace_id":"test"}}'
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.1, App Router, TypeScript |
| AI SDK | `ai` v4, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/groq`, `@ai-sdk/google` |
| HTTP | Native `https.request` for internal endpoints (SSL skip) |
| Fonts | Syne (display), DM Sans (body), JetBrains Mono (code) |
| Styling | Tailwind CSS v3 + custom dark design system |
| Storage | localStorage (configs, recent queries, history) |
| Testing | Jest 29, ts-jest, jest-environment-jsdom |
| CI | GitHub Actions (runs on every push) |

---

## 📊 Supported Models

| Provider | Models |
|---|---|
| OpenAI | GPT-4o Mini, GPT-4o, GPT-3.5 Turbo |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.6 |
| Groq | Llama 3.3 70B, Mixtral 8x7B |
| Google | Gemini 2.5 Flash, Gemini 2.5 Flash Lite |
| Custom | Any OpenAI-compatible endpoint |
| KServe | 18+ preset models |

---

## 🚢 Deployment (Vercel)

```bash
git push origin main
# Connect repo on vercel.com
# Add API keys in Project Settings → Environment Variables
```

> Internal/VPN endpoints work locally only. Public model APIs (OpenAI, Anthropic, etc.) work on Vercel out of the box.

---

## 🗺️ Roadmap

- [ ] Batch testing — run multiple prompts against a model at once
- [ ] Diff view — highlight differences between two panel responses
- [ ] Chart view in Stats — response time and cost bar charts
- [ ] Prompt library — save, version, and reuse prompts
- [ ] Playwright E2E tests for full UI flows

---

## 📄 License

MIT © 2026 [Swathi Chadalavada](https://github.com/YOUR_USERNAME)

Free to use, modify, and distribute. Attribution appreciated but not required.
