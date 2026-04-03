'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useChat } from 'ai/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ModelStatus, PanelMetrics, HistoryEntry, KeyValuePair, SavedConfig, PoolEntry, JudgeResult, ActiveTab } from '../../types/evalify-types';
import { MODELS, JUDGE_MODELS, KNOWN_CUSTOM_MODELS, MODEL_PRICING, DEFAULT_COMPLEXITY, COMPLEXITY_LABELS, COMPLEXITY_MAP, PROMPT_PRESETS, STORAGE_KEY_QUERIES, STORAGE_KEY_CONFIGS, MAX_RECENT_QUERIES, DEFAULT_PANEL_MODELS } from '../../config/evalify-constants';
import { KSERVE_PRESETS, EVAL_CRITERIA_PRESETS } from '../../config/evalify-kserve-presets';
import { CUSTOM_ENDPOINTS, KSERVE_ENDPOINTS } from '../../config/endpoints';
import type { EndpointConfig, KServeEndpointConfig } from '../../config/endpoints';



// ── Resolve API key ─────────────────────────────────────────────
function resolveApiKey(envVar?: string): string {
  if (!envVar) return '';
  return (process.env as any)[envVar] || '';
}

// ── Model color helpers ──────────────────────────────────────────
function getProviderInfo(model: string): { color: string; name: string; badge: string } {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3'))
    return { color: 'var(--openai)', name: 'OpenAI', badge: 'badge-openai' };
  if (model.startsWith('claude'))
    return { color: 'var(--anthropic)', name: 'Anthropic', badge: 'badge-anthropic' };
  if (model.startsWith('llama') || model.startsWith('mixtral'))
    return { color: 'var(--groq)', name: 'Groq', badge: 'badge-groq' };
  if (model.startsWith('gemini'))
    return { color: 'var(--google)', name: 'Google', badge: 'badge-google' };
  return { color: 'var(--custom)', name: 'Custom', badge: 'badge-custom' };
}

function getModelColor(model: string): string {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma')) return 'groq';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('llm_generic') || model.startsWith('nowllm') || model.startsWith('code_assist')) return 'kserve';
  return 'custom';
}
function getModelBadgeClass(model: string): string { return `badge-${getModelColor(model)}`; }
function getPanelBorderClass(model: string): string { return `panel-${getModelColor(model)}`; }

// ── localStorage helpers ─────────────────────────────────────────
function loadRecentQueries(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_QUERIES) || '[]'); } catch { return []; }
}
function saveRecentQuery(query: string) {
  if (typeof window === 'undefined') return;
  const existing = loadRecentQueries();
  const updated = [query, ...existing.filter(q => q !== query)].slice(0, 10);
  localStorage.setItem(STORAGE_KEY_QUERIES, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('evalify-query-saved', { detail: updated }));
}
function loadConfigs(): SavedConfig[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CONFIGS) || '[]'); } catch { return []; }
}
function saveConfigs(configs: SavedConfig[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CONFIGS, JSON.stringify(configs));
}
function loadJudgeHistory(): JudgeResult[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('evalify-judge-history') || '[]'); } catch { return []; }
}
function saveJudgeResult(result: JudgeResult) {
  if (typeof window === 'undefined') return;
  const existing = loadJudgeHistory();
  const updated = [result, ...existing].slice(0, 50);
  localStorage.setItem('evalify-judge-history', JSON.stringify(updated));
}
function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null && !isNaN(n));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ── Stats ─────────────────────────────────────────────────────
// avg → defined in helper functions above

export function StatsPanel({ history, onClearHistory }: { history: HistoryEntry[]; onClearHistory: () => void }) {
  const [judgeHistory, setJudgeHistory] = useState<JudgeResult[]>([]);
  const [activeSection, setActiveSection] = useState<'responses' | 'judge'>('responses');

  useEffect(() => { setJudgeHistory(loadJudgeHistory()); }, []);

  const exportJudgeCSV = () => {
    const headers = ['Time', 'Prompt', 'Judge Model', 'Criteria', 'Winner', 'Responses', 'Reasoning'];
    const rows = judgeHistory.map(j => [
      j.timestamp,
      `"${j.prompt.replace(/"/g, '""')}"`,
      j.judgeModel,
      `"${j.criteria.replace(/"/g, '""')}"`,
      j.winner,
      `"${j.responses.map(r => r.label).join(', ')}"`,
      `"${j.reasoning.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `judge-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (!history.length && !judgeHistory.length) return <div className="text-sm text-gray-400 text-center py-8">No data yet!</div>;

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveSection('responses')} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${activeSection === 'responses' ? 'btn-primary' : 'btn-ghost'}`}>
          📊 Response History {history.length > 0 && `(${history.length})`}
        </button>
        <button onClick={() => setActiveSection('judge')} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${activeSection === 'judge' ? 'btn-judge' : 'btn-ghost'}`}>
          ⚖️ Judge History {judgeHistory.length > 0 && `(${judgeHistory.length})`}
        </button>
      </div>

      {/* Response history section */}
      {activeSection === 'responses' && history.length > 0 && (() => {
        const byModel: Record<string, HistoryEntry[]> = {};
        history.forEach(h => { if (!byModel[h.model]) byModel[h.model] = []; byModel[h.model].push(h); });
        const totalCost = history.reduce((sum, h) => sum + ((!isNaN(h.cost ?? 0) ? h.cost : 0) ?? 0), 0);
        const scored = history.filter(h => h.score !== null);
        const overallWinRate = scored.length > 0 ? Math.round((history.filter(h => h.score === 'up').length / scored.length) * 100) : null;
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="stat-card"><div className="stat-number gradient-text">{history.length}</div><div className="text-xs mt-2" style={{color:"var(--text-muted)"}}>Responses</div></div>
              <div className="stat-card"><div className="stat-number" style={{color:"#10b981"}}>{avg(history.map(h => h.responseTime).filter(Boolean) as number[])}ms</div><div className="text-xs mt-2" style={{color:"var(--text-muted)"}}>Avg Time</div></div>
              <div className="stat-card"><div className="stat-number" style={{color:"var(--groq)"}}>{avg(history.map(h => h.tokens).filter(Boolean) as number[])}</div><div className="text-xs mt-2" style={{color:"var(--text-muted)"}}>Avg Tokens</div></div>
              <div className="stat-card"><div className="stat-number" style={{color:"var(--judge)"}}>${totalCost.toFixed(5)}</div><div className="text-xs mt-2" style={{color:"var(--text-muted)"}}>Total Cost</div></div>
              <div className="stat-card"><div className="stat-number gradient-text-warm">{overallWinRate !== null ? `${overallWinRate}%` : '—'}</div><div className="text-xs mt-2" style={{color:"var(--text-muted)"}}>👍 Rate</div></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(byModel).map(([model, entries]) => {
                const ms = entries.filter(e => e.score !== null);
                const wr = ms.length > 0 ? Math.round((entries.filter(e => e.score === 'up').length / ms.length) * 100) : null;
                return (
                  <div key={model} className="glass-dark rounded-xl p-3 text-xs space-y-1">
                    <div className="font-semibold font-display truncate" style={{color:"var(--text-primary)"}}>{model}</div>
                    <div className="" style={{color:"var(--text-secondary)"}}>Responses: <strong>{entries.length}</strong></div>
                    <div className="" style={{color:"var(--text-secondary)"}}>Avg time: <strong>{avg(entries.map(e => e.responseTime).filter(Boolean) as number[])}ms</strong></div>
                    <div className="" style={{color:"var(--text-secondary)"}}>Cost: <strong className="text-yellow-600">${entries.reduce((s, e) => s + (e.cost ?? 0), 0).toFixed(5)}</strong></div>
                    {wr !== null && <div className="" style={{color:"var(--text-secondary)"}}>Win rate: <strong className={wr >= 50 ? 'text-green-600' : 'text-red-500'}>{wr}% 👍</strong></div>}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold font-display" style={{color:"var(--text-primary)"}}>Full Log</h3><button onClick={onClearHistory} className="text-xs" style={{color:"#ef4444"}}>Clear</button></div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr style={{background:"var(--bg-elevated)"}}>{['Time','Panel','Question','Model','Level','⏱ ms','Tokens','Cost','Score'].map(h => <th key={h} className="text-left p-2 font-mono text-[10px] uppercase tracking-widest" style={{borderBottom:"1px solid var(--border)",color:"var(--text-muted)"}}>{h}</th>)}</tr></thead>
                <tbody>{[...history].reverse().map((h, i) => (
                  <tr key={h.id} style={{background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)'}}>
                    <td className="p-2 font-mono text-[10px]" style={{borderBottom:"1px solid var(--border)",color:"var(--text-muted)"}}>{h.timestamp}</td>
                    <td className="p-2 border">{h.panel}</td>
                    <td className="p-2 border text-gray-600 max-w-[150px] truncate">{h.question}</td>
                    <td className="p-2 border max-w-[120px] truncate">{h.model}</td>
                    <td className="p-2 border">{h.level}</td>
                    <td className="p-2 border text-right font-mono">{(h.responseTime != null && !isNaN(h.responseTime)) ? h.responseTime : '—'}</td>
                    <td className="p-2 border text-right font-mono">{(h.tokens != null && !isNaN(h.tokens)) ? h.tokens : '—'}</td>
                    <td className="p-2 border text-right font-mono text-green-600">{(h.cost != null && !isNaN(h.cost)) ? `$${h.cost.toFixed(5)}` : '—'}</td>
                    <td className="p-2 border text-center">{h.score === 'up' ? '👍' : h.score === 'down' ? '👎' : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {activeSection === 'responses' && history.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-8">No response data yet — ask some questions first!</div>
      )}

      {/* Judge history section */}
      {activeSection === 'judge' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">{judgeHistory.length} evaluation{judgeHistory.length !== 1 ? 's' : ''} saved</div>
            <div className="flex gap-2">
              {judgeHistory.length > 0 && (
                <button onClick={exportJudgeCSV} className="btn-ghost text-xs px-3 py-1.5" style={{borderColor:"rgba(16,185,129,0.3)",color:"var(--openai)"}}>⬇️ Export CSV</button>
              )}
              {judgeHistory.length > 0 && (
                <button onClick={() => { localStorage.removeItem(STORAGE_KEY_JUDGE); setJudgeHistory([]); }} className="text-xs transition-opacity" style={{color:"#ef4444"}}>Clear all</button>
              )}
            </div>
          </div>

          {judgeHistory.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-8">No judge evaluations yet — run the ⚖️ Judge to see results here!</div>
          ) : (
            <div className="space-y-3">
              {judgeHistory.map((j, i) => (
                <div key={j.id} className="glass-dark rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-700 truncate">Q: {j.prompt}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-400">{j.timestamp}</span>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded">Judge: {j.judgeModel}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded">{j.criteria}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-lg">🏆</span>
                      <span className="text-sm font-bold text-gray-800">{j.winner}</span>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(j.scores).map(([label, scores]: [string, any]) => (
                      <div key={label} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${label === j.winner ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-100'}`}>
                        {label === j.winner && <span>🏆</span>}
                        <span className="font-medium text-gray-700">{label}</span>
                        <span className={`font-mono font-bold ${scores.overall >= 8 ? 'text-green-600' : scores.overall >= 6 ? 'text-yellow-600' : 'text-red-500'}`}>{scores.overall}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bar chart */}
                  <div className="space-y-1">
                    {Object.entries(j.scores).map(([label, scores]: [string, any]) => (
                      <div key={label} className="flex items-center gap-2">
                        <div className="text-[10px] w-24 text-gray-500 truncate">{label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: `${(scores.overall / 10) * 100}%`, backgroundColor: label === j.winner ? '#facc15' : '#93c5fd' }} />
                        </div>
                        <div className="text-[10px] font-mono w-6 text-right text-gray-500">{scores.overall}</div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[10px] text-gray-500 italic border-t pt-2">{j.reasoning}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


