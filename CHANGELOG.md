# Changelog

All notable changes to Evalify are documented here.

---

## [1.0.0] — 2026-04-02 — Initial Release 🎉

### Added

**Core Features**
- ⚡ Compare Models tab — 4-panel side-by-side comparison (GPT-4o, Claude Haiku, Llama 3.3 70B, Gemini 2.5 Flash)
- 🔌 Custom Endpoint tab — any OpenAI-compatible API with SSL skip support
- 🧬 KServe v2 tab — 18 preset models for KServe v2 inference servers
- ⚖️ BYOJ Judge tab — MT-Bench style evaluation with 9 criteria presets
- 📊 Stats tab — response history, judge history, CSV export

**Model Parameters (per panel)**
- Temperature slider (0–2, auto-clamped to 1.0 for Anthropic)
- Max tokens slider (100–4000)
- Top-p slider (skipped for Anthropic per API limitation)
- Each panel has fully independent parameter settings

**Broadcast**
- Ask All — sends query to all 4 compare panels
- 📡 All — sends to all 6 endpoints simultaneously
- 🗑 Clear — clears all 4 panels at once

**Judge Pool**
- Same-question enforcement — pool locks to first question added
- 🔒 Diff. question indicator when pool is locked to different question
- Run Judge button navigates directly to Judge tab

**Architecture (SOLID)**
- Phase 1: types/ and config/ extracted from monolith
- Phase 2: page.tsx imports from config files
- Phase 3: all components extracted to app/components/
- page.tsx reduced from 2261 → 220 lines

**Testing**
- 380+ unit tests across 13 test files
- Tests run before server starts (`npm run dev`)
- Coverage: provider routing, SSL config, CSV export, pool lock, parameter limits, clear all, judge evaluation

**Other**
- 💾 Save/load named configs (localStorage)
- 🕐 Recent queries shared across all tabs
- 👍/👎 scoring with win rate tracking in Stats
- MIT License

### Provider Support

| Provider | Models | Temperature |
|---|---|---|
| OpenAI | GPT-4o Mini, GPT-4o, GPT-3.5 Turbo | 0–2 |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 4.6 | 0–1 |
| Groq | Llama 3.3 70B, Mixtral 8x7B | 0–2 |
| Google | Gemini 2.5 Flash, Gemini 2.5 Flash Lite | 0–2 |

### Known Limitations
- Internal/VPN endpoints only work in local development (not Vercel)
- Batch testing not yet implemented
- No diff view between panels yet

---

## Roadmap

- [ ] API code panel — Python/TypeScript/curl for each response
- [ ] Batch testing — run multiple prompts at once
- [ ] Diff view — highlight differences between panels
- [ ] Playwright E2E tests
- [ ] Prompt library — save and version prompts
