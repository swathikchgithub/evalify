# Evalify Testing Plan

## What needs testing (priority order)

### Unit Tests (Jest) — ~30 mins to write, run in <5s
These test pure functions that can break silently:

| Function | What to test |
|---|---|
| `extractNestedContent()` | Double-encoded JSON → clean text |
| `avg()` | NaN handling, empty array, normal case |
| KServe `{{query}}` template substitution | Special chars, empty query |
| `saveRecentQuery()` | Max 10 items, dedup |
| `getProviderInfo()` | Each model prefix |
| localStorage helpers | Save/load/corrupt JSON |

### Integration Tests (Jest + MSW mock server) — ~1 hour
| Route | What to test |
|---|---|
| `POST /api/chat` | Custom endpoint 200, 400, 503 responses |
| `POST /api/chat` | Double-encoded response extraction |
| `POST /api/kserve` | `/v1` URL stripping, 404 handling |
| `POST /api/judge` | Valid scores JSON, malformed response |

### E2E Tests (Playwright) — ~2 hours
| Flow | What to test |
|---|---|
| Compare tab | Ask question → 4 responses appear |
| Judge tab | Select 2 responses → Run Judge → scores display |
| Stats tab | Navigate without NaN crash |
| Save config | Save → reload page → config still there |

## Setup (30 mins total)

```bash
npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom
npm install --save-dev @playwright/test
npx playwright install chromium
```

`jest.config.ts`:
```ts
export default {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

## GitHub Actions CI (auto-run on every push)

`.github/workflows/test.yml`:
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test           # Jest unit tests
      # E2E skipped in CI (needs real API keys)
```

## Honest assessment
You have 3,500+ lines of working, battle-tested code.
The highest-ROI tests right now are:
1. `extractNestedContent()` — this broke silently 3 times
2. Stats NaN guard — just hit this
3. KServe URL stripping — just fixed
4. Judge same-question enforcement — core feature

Want me to write these 4 unit tests right now?
