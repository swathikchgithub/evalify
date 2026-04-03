# 📖 Evalify — User Guide

## Table of Contents
- [Getting Started](#getting-started)
- [Compare Models Tab](#compare-models-tab)
- [Custom Endpoint Tab](#custom-endpoint-tab)
- [KServe v2 Tab](#kserve-v2-tab)
- [Judge Tab](#judge-tab)
- [Stats Tab](#stats-tab)
- [Tips & Workflows](#tips--workflows)

---

## Getting Started

1. Add your API keys to `.env.local`:
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...
GOOGLE_GENERATIVE_AI_API_KEY=AI...
```

2. Start the app:
```bash
npm run dev
```

3. Open `http://localhost:3000`

---

## ⚡ Compare Models Tab

The main tab. Four panels side by side — one per model.

### Sending a question
- Type in the bottom input bar
- **Ask All** — sends to all 4 compare panels only
- **📡 All** — sends to all 6 endpoints (compare + custom + KServe)
- Press **Enter** or click Ask All
- **💡** button — opens sample question categories (AI, Engineering, Business, etc.)

### Per-panel controls
Each panel has its own independent settings:

| Control | What it does |
|---|---|
| Model dropdown | Switch to any supported model |
| ✏️ button | Open system prompt editor |
| 🗑 button | Clear that panel only |
| Complexity slider | Age 5 → Expert (sets system prompt automatically) |
| Temperature | 0 = deterministic, 1 = balanced, 2 = creative (Claude max is 1.0) |
| Max tokens | Cap the response length (100–4000) |
| Top-p | Nucleus sampling — lower = more focused (not used for Claude) |

### Scoring responses
Each response has:
- **👍 / 👎** — score the response (tracked in Stats)
- **📋** — copy response to clipboard
- **➕ Add to Judge** — add to evaluation pool

### Clear All
Click **🗑 Clear** in the form bar to wipe all 4 panels at once.

---

## 🔌 Custom Endpoint Tab

Test any OpenAI-compatible API.

### Setup
1. Enter your endpoint URL (e.g. `https://your-server.com/v1`)
2. Add API key if required
3. Enter model name
4. Toggle **Skip SSL** if your server uses self-signed certificates
5. Add custom headers (e.g. `X-Allow-Routing: hybrid`)
6. Add custom body fields (e.g. `request_metadata: {"trace_id":"test"}`)

### Saving configs
Click **💾 Save Config** to store your setup. Load it next time from the saved configs list.

### Broadcast
When you click **📡 All** from the Compare tab, your query is also sent here automatically (if a URL is configured).

---

## 🧬 KServe v2 Tab

Test KServe v2 inference servers.

### Setup
1. Enter your KServe server URL — **no `/v1` needed** (auto-stripped)
2. Select a preset from the 18 built-in options, or write a custom template
3. Use `{{query}}` as the placeholder for your question

### Presets include
- LLM chat completions (standard and large variants)
- Content moderation with configurable safety checks
- Text summarization and question answering
- Code completion
- Text embeddings (multiple dimensions)
- PII detection and document intelligence

> Presets are defined in `config/evalify-kserve-presets.ts` — add your own model templates there.

---

## ⚖️ Judge Tab (BYOJ)

Run MT-Bench style evaluations on responses.

### Step 1 — Add responses to the pool
From any tab, click **➕ Add to Judge** on any response.

> ⚠️ All responses must answer the **same question** — the pool locks to the first question added. Different-question responses show **🔒 Diff. question**.

### Step 2 — Configure the judge
1. Select a judge model (GPT-4o Mini recommended for speed)
2. Or use a custom endpoint as the judge
3. Pick evaluation criteria (or leave blank for MT-Bench default)

### Step 3 — Run
Click **⚖️ Run Judge**. Results show:
- 🏆 Winner banner
- Score table per criterion (color-coded: green ≥8, amber ≥6, red <6)
- Score comparison bars
- Full reasoning from the judge

### Evaluation criteria presets
MT-Bench (default) · Code Quality · RAG/QA Accuracy · Safety · Business Communication · Educational · Medical · Legal · Customer Support

### Navigating to Judge
- Click the **Judge** tab directly
- Or click **⚖️ Run Judge** in the pool bar at the top (appears when 2+ responses are in the pool)

---

## 📊 Stats Tab

View all evaluation history in one place.

### Response History
- All responses from all tabs
- Per-model: avg response time, avg tokens, total cost, win rate (from 👍/👎)
- Full log table with timestamps

### Judge History
- All past judge evaluations
- Score charts and full reasoning
- Searchable and filterable

### Export
Click **⬇️ Export CSV** to download either history as a spreadsheet.

### Clear
Click **🗑 Clear History** to wipe response history.

---

## 💡 Tips & Workflows

### Workflow 1 — Model comparison at temperature=0
Set all 4 panels to `temperature=0` for fully deterministic output. Ask the same factual question. Any difference in answers reveals model knowledge gaps — not random variation.

### Workflow 2 — Find the creativity sweet spot
```
Panel A: temp=0    (precise)
Panel B: temp=0.5  (slightly creative)
Panel C: temp=1.0  (balanced)
Panel D: temp=1.5  (creative, OpenAI/Groq only)
```
Ask: *"Write a product description for a coffee brand"*
See how creativity scales with temperature.

### Workflow 3 — Token budget comparison
Set all panels to `max_tokens=200`. Ask a complex question. See which model gives the best answer within the constraint — great for production cost planning.

### Workflow 4 — Internal endpoint vs public model
1. Configure Custom Endpoint with your internal server
2. Set Compare panel to the equivalent public model
3. Click **📡 All** — both get the same question simultaneously
4. Add both to Judge pool → run evaluation

### Workflow 5 — Prompt engineering comparison
1. Panel A: default complexity (Age 5)
2. Panel B: click ✏️ → write a custom system prompt
3. Same question to both
4. Judge which system prompt produces better responses

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit question (in input bar) |
| `Shift+Enter` | New line in input |
| `Esc` | Close dropdowns/editors |

---

## 🔧 Troubleshooting

| Issue | Fix |
|---|---|
| Claude not responding | Check temperature ≤ 1.0 (Claude max). Route auto-clamps but verify |
| Custom endpoint SSL error | Enable **Skip SSL** checkbox |
| KServe 404 error | Remove `/v1` from the URL — it's added automatically |
| Empty response from internal server | Check **Extra Body Fields** — add `request_metadata` if required |
| Pool locked to wrong question | Click **Clear** in the pool bar to reset |
| Response cuts off early | Increase **Max tokens** slider |
