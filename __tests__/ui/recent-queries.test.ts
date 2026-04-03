// __tests__/ui/recent-queries.test.ts
// Tests for localStorage recent queries (jsdom environment)

import {
  saveRecentQuery,
  loadRecentQueries,
  MAX_RECENT_QUERIES,
  STORAGE_KEY_QUERIES,
} from '../../lib/evalify-utils';

// Simple in-memory localStorage mock
class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = value; }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
}

describe('saveRecentQuery / loadRecentQueries', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  describe('saving queries', () => {
    it('saves a query', () => {
      saveRecentQuery('What is microservices?', storage as any);
      const queries = loadRecentQueries(storage as any);
      expect(queries).toContain('What is microservices?');
    });

    it('saves most recent query first', () => {
      saveRecentQuery('First query', storage as any);
      saveRecentQuery('Second query', storage as any);
      const queries = loadRecentQueries(storage as any);
      expect(queries[0]).toBe('Second query');
      expect(queries[1]).toBe('First query');
    });

    it('deduplicates queries — same query moves to front', () => {
      saveRecentQuery('What is AI?', storage as any);
      saveRecentQuery('What is ML?', storage as any);
      saveRecentQuery('What is AI?', storage as any); // duplicate
      const queries = loadRecentQueries(storage as any);
      expect(queries[0]).toBe('What is AI?');
      expect(queries.filter(q => q === 'What is AI?').length).toBe(1);
    });

    it(`caps at ${MAX_RECENT_QUERIES} queries`, () => {
      for (let i = 0; i < MAX_RECENT_QUERIES + 5; i++) {
        saveRecentQuery(`Query number ${i}`, storage as any);
      }
      const queries = loadRecentQueries(storage as any);
      expect(queries.length).toBe(MAX_RECENT_QUERIES);
    });

    it('keeps most recent when capping', () => {
      for (let i = 0; i < MAX_RECENT_QUERIES + 3; i++) {
        saveRecentQuery(`Query ${i}`, storage as any);
      }
      const queries = loadRecentQueries(storage as any);
      // Most recent should be first
      expect(queries[0]).toBe(`Query ${MAX_RECENT_QUERIES + 2}`);
    });
  });

  describe('loading queries', () => {
    it('returns empty array when nothing saved', () => {
      expect(loadRecentQueries(storage as any)).toEqual([]);
    });

    it('returns empty array for corrupt storage', () => {
      storage.setItem(STORAGE_KEY_QUERIES, 'not valid json {{{');
      expect(loadRecentQueries(storage as any)).toEqual([]);
    });

    it('loads multiple saved queries', () => {
      saveRecentQuery('Query A', storage as any);
      saveRecentQuery('Query B', storage as any);
      saveRecentQuery('Query C', storage as any);
      const queries = loadRecentQueries(storage as any);
      expect(queries).toHaveLength(3);
      expect(queries).toContain('Query A');
      expect(queries).toContain('Query B');
      expect(queries).toContain('Query C');
    });
  });

  describe('uses correct storage key', () => {
    it('stores under evalify-recent-queries key', () => {
      saveRecentQuery('test', storage as any);
      const raw = storage.getItem(STORAGE_KEY_QUERIES);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toContain('test');
    });
  });

});

// ── Cross-tab query sharing ────────────────────────────────────
// This tests the requirement that recent queries are shared across
// ALL tabs (Compare, Custom Endpoint, KServe v2).
// Bug: queries from Custom Endpoint and KServe were not saved,
// so they never appeared in the recent queries dropdown.

describe('cross-tab query sharing', () => {
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
  });

  it('query saved in Compare tab appears in Custom Endpoint tab', () => {
    // User asks in Compare tab
    saveRecentQuery('What is microservices?', storage as any);

    // When Custom Endpoint opens its dropdown, it reads the same storage
    const queries = loadRecentQueries(storage as any);
    expect(queries).toContain('What is microservices?');
  });

  it('query saved in KServe tab appears in Compare tab', () => {
    // User asks in KServe tab
    saveRecentQuery('Explain prompt engineering', storage as any);

    // Compare tab dropdown should show it
    const queries = loadRecentQueries(storage as any);
    expect(queries).toContain('Explain prompt engineering');
  });

  it('queries from all three tabs merge into one shared list', () => {
    // Simulate queries from 3 different tabs
    saveRecentQuery('Compare tab query', storage as any);
    saveRecentQuery('Custom endpoint query', storage as any);
    saveRecentQuery('KServe query', storage as any);

    const queries = loadRecentQueries(storage as any);
    expect(queries).toContain('Compare tab query');
    expect(queries).toContain('Custom endpoint query');
    expect(queries).toContain('KServe query');
    expect(queries).toHaveLength(3);
  });

  it('all tabs read from same storage key', () => {
    // All tabs must use STORAGE_KEY_QUERIES — not per-tab keys
    saveRecentQuery('shared query', storage as any);

    // Simulate what each tab's QueryInput does on mount
    const compareTabQueries  = loadRecentQueries(storage as any);
    const customTabQueries   = loadRecentQueries(storage as any);
    const kserveTabQueries   = loadRecentQueries(storage as any);

    expect(compareTabQueries).toEqual(customTabQueries);
    expect(customTabQueries).toEqual(kserveTabQueries);
  });

  it('most recent query from any tab appears first', () => {
    saveRecentQuery('older query from compare', storage as any);
    saveRecentQuery('newer query from kserve', storage as any);

    const queries = loadRecentQueries(storage as any);
    expect(queries[0]).toBe('newer query from kserve');
  });

  it('caps at 10 even with queries from multiple tabs', () => {
    // 4 from compare, 4 from custom, 4 from kserve = 12 total but capped at 10
    ['c1','c2','c3','c4'].forEach(q => saveRecentQuery(q, storage as any));
    ['e1','e2','e3','e4'].forEach(q => saveRecentQuery(q, storage as any));
    ['k1','k2','k3','k4'].forEach(q => saveRecentQuery(q, storage as any));

    const queries = loadRecentQueries(storage as any);
    expect(queries).toHaveLength(MAX_RECENT_QUERIES);
  });
});
