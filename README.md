# ⚡ Evalify — LLM Evaluation Platform

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg) ![Tests](https://img.shields.io/badge/tests-380%2B%20passing-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16.2-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)

🌐 **Live Demo: [evalify-six.vercel.app](https://evalify-six.vercel.app)**

> **Compare LLMs side by side · Test any endpoint · Run MT-Bench style evaluations · BYOJ Judge**

Evalify is an open-source, production-grade LLM evaluation tool built with Next.js. Compare public models, test private/internal endpoints (including KServe v2 inference servers), tune model parameters, and run AI-powered evaluations using the MT-Bench BYOJ (Bring Your Own Judge) framework.

---

## 🚀 Quick Start

```bash
git clone https://github.com/swathikchgithub/evalify.git
cd evalify
npm install
cp .env.local.example .env.local
# Add your API keys to .env.local
npm run dev
```

---

## 📚 Documentation

- **[Usage Guide](USAGE.md)** — detailed walkthrough of every feature, workflows, and troubleshooting
- **[Changelog](CHANGELOG.md)** — release notes and version history

---

## 🔑 Environment Variables

```env
# .env.local — never commit this file

OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=AI...
OPENROUTER_API_KEY=sk-or-...      # optional — enables DeepSeek, Llama 4, 100+ models
```

---

## 🏃 Run Modes

| Command | What it does |
|---|---|
| `npm run dev` | Tests first → start server (blocks on failure) |
| `npm run dev:full` | Server + test watch simultaneously |
| `npm run dev:server` | Server only, skip tests |
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on every file save |
| `npm run test:coverage` | Tests + coverage report |

---

## ✨ Features

### ⚡ Compare Models
- 4-panel side-by-side: GPT-4o, Claude Haiku, Llama 3.3 70B, Gemini 2.5 Flash
- **Per-panel parameters**: Temperature, Max tokens, Top-p — each panel independent
  - Temperature auto-clamped per provider (Claude max=1.0, others max=2.0)
  - Top-p skipped for Anthropic (API limitation)
- **Ask All** — sends to all 4 compare panels simultaneously
- **📡 All** — sends to all 6 endpoints (compare + custom + KServe)
- **🗑 Clear** — clears all 4 panels at once
- Complexity slider: Age 5 → Expert
- **Panel selector** — send to specific panels only (shows real model names)
- Custom system prompts with 7 presets
- Per-response: response time (ms), token count, cost ($)
- 👍/👎 scoring + win rate tracking
- ➕ Add to Judge pool (same-question enforcement)
- 📋 Copy per message

### 🔌 Custom Endpoint
- Any OpenAI-compatible API (`/v1/chat/completions`)
- SSL skip for self-signed certs (internal/private servers)
- Custom headers + body fields
- Save/load named configs to localStorage
- Works with: Ollama, vLLM, LM Studio, any internal LLM server, OpenRouter, Together AI

### 🧬 KServe v2
- 18+ model presets for KServe v2 inference servers
- Auto-strips `/v1` suffix from URL
- Custom `{{query}}` template editor
- Covers: LLM chat, moderation, summarization, QA, code, PII detection, embeddings

### ⚖️ Judge (BYOJ — Bring Your Own Judge)
- Pick judge model: GPT-4o Mini, Claude Sonnet, Gemini, Llama, **DeepSeek V3/R1**, or your own endpoint
- Custom endpoint as judge with SSL skip support
- 9 evaluation criteria presets: MT-Bench · Code Quality · RAG/QA · Safety · Business · Medical · Legal · Educational · Customer Support
- Same-question enforcement — pool locked to first question added
- Score table (color-coded), comparison bars, winner banner
- Auto-saves to localStorage, viewable in Stats

### 📊 Stats
- Response History: per-model avg time, tokens, cost, win rate
- Judge History: all evaluations with scores and reasoning
- Export CSV (response history + judge history)

---

## ⚙️ Model Parameters

Each compare panel has independent parameter controls:

| Parameter | Range | Default | Notes |
|---|---|---|---|
| Temperature | 0–2 (0–1 for Claude) | 0.7 | 0=deterministic, 1=balanced, 2=creative |
| Max tokens | 100–4000 | 500 | Caps response length |
| Top-p | 0.1–1.0 | 1.0 | Nucleus sampling (not used for Claude) |

**Provider limits enforced automatically:**
- Anthropic (Claude): temperature clamped to 1.0, top-p skipped
- OpenAI, Groq, Google, OpenRouter: full range supported

---

## 🏗️ Architecture (SOLID)

```
evalify/
├── app/
│   ├── page.tsx                     ← ~220 lines, composition root only
│   ├── components/
│   │   ├── shared.tsx               ← utility fns + small shared components
│   │   ├── ChatPanel.tsx            ← single compare panel
│   │   ├── CustomEndpointTab.tsx    ← custom endpoint UI
│   │   ├── KServeTab.tsx            ← KServe v2 tab
│   │   ├── StatsPanel.tsx           ← evaluation history
│   │   ├── JudgeTab.tsx             ← BYOJ judge
│   │   └── QueryInput.tsx           ← shared query input
│   └── api/
│       ├── chat/route.ts            ← Compare + Custom (SSL skip, provider routing)
│       ├── kserve/route.ts          ← KServe v2 inference
│       ├── judge/route.ts           ← BYOJ judge (all providers + custom)
│       └── endpoints/route.ts       ← Team endpoint config loader
├── types/
│   └── evalify-types.ts             ← all shared TypeScript interfaces
├── config/
│   ├── evalify-constants.ts         ← models, pricing, complexity
│   ├── evalify-kserve-presets.ts    ← KServe presets + eval criteria
│   └── endpoints.ts                 ← team endpoint config (no secrets)
├── lib/
│   └── evalify-utils.ts             ← pure utility functions
└── __tests__/
    ├── node/                        ← 10 test files, Jest node env
    └── ui/                          ← localStorage tests, jsdom env
```

---

## 🧪 Tests (380+ passing)

```bash
npm test                   # run all tests (~1.4 seconds)
npm run test:watch         # watch mode
npm run test:coverage      # with coverage report
```

| File | Tests | Protects Against |
|---|---|---|
| `extractNestedContent` | 12 | Blank responses from double-encoded JSON |
| `kserve-utils` | 11 | KServe 404 from /v1/v2/ path conflict |
| `stats-utils` | 14 | NaN crash, Value: prefix 400 error |
| `provider-utils` | 12 | Wrong model routing |
| `judge-prompt-normalization` | 21 | Cross-tab different-question judging |
| `judge-route` | 35 | Prompt building, JSON parsing |
| `judge-custom-endpoint` | 40+ | SSL config, model dropdown |
| `compare-panel-actions` | 73 | Clear, scores, CSV, complexity |
| `button-actions` | 55+ | Ask All, 📡 All, pool lock, Run Judge |
| `params-utils` | 20+ | Temp/maxTokens/topP, provider limits |
| `phase1-constants` | 54 | Extracted types/constants correctness |
| `phase3-components` | 27 | SOLID component contracts |
| `recent-queries` | 15 | localStorage, dedup, cross-tab sync |

---

## 🔌 Testing Internal Endpoints

### Custom Endpoint (OpenAI-compatible)
```
URL:           https://your-ml-inference-server.com/v1
Model:         your-model-name
Skip SSL:      ✅ (required for self-signed certs)
Extra Headers: X-Allow-Routing → hybrid
Extra Body:    request_metadata → {"trace_id":"evalify-test"}
```

### KServe v2
```
URL:     https://your-ml-inference-server.com  (no /v1 — auto-stripped)
Preset:  Select from 18+ built-in presets
```

### Verify endpoint with curl
```bash
curl -k -X POST "https://your-server.com/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"your-model","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2, App Router, TypeScript 5 |
| AI SDK | `ai` v4, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/groq`, `@ai-sdk/google` |
| HTTP | Native `https.request` for internal endpoints (SSL skip) |
| Styling | Tailwind CSS v3 + custom dark design system |
| Storage | localStorage (configs, queries, history) |
| Testing | Jest 29, ts-jest, jest-environment-jsdom |
| CI | GitHub Actions |

---

## 📊 Supported Models

| Provider | Models |
|---|---|
| OpenAI | GPT-4o Mini, GPT-4o, GPT-3.5 Turbo |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.6 |
| Groq | Llama 3.3 70B, Mixtral 8x7B |
| Google | Gemini 2.5 Flash, Gemini 2.5 Flash Lite |
| OpenRouter | DeepSeek V3, DeepSeek R1, Llama 4 Maverick, Gemini 2.5 Pro, 100+ more |
| Custom | Any OpenAI-compatible endpoint |
| KServe | 18+ preset models |

---

## 🚢 Deploy to Vercel

```bash
# 1. Push to GitHub
git push origin main

# 2. Connect on vercel.com → Import Repository
# 3. Add environment variables in Project Settings
# 4. Deploy — done
```

> Internal/VPN endpoints only work locally. Public model APIs work on Vercel out of the box.

---

## 🗺️ Roadmap

- [ ] API code panel (Python / TypeScript / curl) for each response
- [ ] Batch testing — run multiple prompts at once
- [ ] Diff view — highlight differences between panels
- [ ] Playwright E2E tests
- [ ] Prompt library — save and version prompts

---

## 📄 License

MIT © 2026 [Swathi Chadalavada](https://github.com/swathikchgithub)

Free to use, modify, and distribute. Attribution appreciated but not required.
