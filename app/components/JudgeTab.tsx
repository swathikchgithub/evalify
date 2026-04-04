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

import { KeyValueEditor, TeamEndpointPicker } from './shared';


const DEBUG = false;
const log      = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => DEBUG && console.error(...args);

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
  if (model.includes('/')) return { color: 'var(--openrouter)', name: 'OpenRouter', badge: 'badge-openrouter' };
  return { color: 'var(--custom)', name: 'Custom', badge: 'badge-custom' };
}

function getModelColor(model: string): string {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma')) return 'groq';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('llm_generic') || model.startsWith('nowllm') || model.startsWith('code_assist')) return 'kserve';
  if (model.includes('/')) return 'openrouter';
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

// ── JudgeTab — full page judge (replaces modal) ───────────────
export function JudgeTab({ pool, allHistory, onRemoveFromPool, onNavigate }: {
  pool: PoolEntry[];
  allHistory: HistoryEntry[];
  onRemoveFromPool: (id: string) => void;
  onNavigate: (tab: 'compare' | 'openai' | 'kserve' | 'judge' | 'stats') => void;
}) {
  const [judgeModel, setJudgeModel]           = useState('gpt-4o-mini');
  const [criteria, setCriteria]               = useState('');
  const [selectedIds, setSelectedIds]         = useState<string[]>(pool.map(p => p.id));

  // Clear stale results when pool entries change
  useEffect(() => {
    setSelectedIds(pool.map(p => p.id));
    setResult(null);
    setSaved(false);
  }, [pool.map(p => p.id).join(',')]);
  const [customJudgeUrl, setCustomJudgeUrl]     = useState('');
  const [customJudgeKey, setCustomJudgeKey]     = useState('');
  const [customJudgeModel, setCustomJudgeModel]   = useState('');
  const [customJudgeSkipSsl, setCustomJudgeSkipSsl] = useState(true); // default true for internal endpoints
  const [customJudgeHeaders, setCustomJudgeHeaders] = useState<KeyValuePair[]>([{ key: 'X-Allow-Routing', value: 'hybrid' }]);
  const [judging, setJudging]                 = useState(false);
  const [result, setResult]                   = useState<any>(null);
  const [error, setError]                     = useState('');
  const [saved, setSaved]                     = useState(false);
  const [selectionTab, setSelectionTab]       = useState<'pool' | 'history'>('pool');
  const [historyFilter, setHistoryFilter]     = useState('');
  const [extraEntries, setExtraEntries]       = useState<PoolEntry[]>([]);

  const toggleId = (id: string) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );

  // Normalize prompt for comparison — trim + lowercase to handle
  // slight differences between tabs (whitespace, case)
  const norm = (s: string) => (s ?? '').trim().toLowerCase();

  const addFromHistory = (h: HistoryEntry) => {
    const exists = [...pool, ...extraEntries].find(p => p.id === h.id);
    if (!exists) {
      const entry: PoolEntry = {
        id: h.id, label: `${h.panel} — ${h.model.split('-')[0]}`,
        model: h.model, content: `[Response — ${h.timestamp}]`,
        prompt: h.question.trim(), // normalize on store
        tab: 'history', timestamp: h.timestamp,
      };
      setExtraEntries(prev => [...prev, entry]);
      setSelectedIds(prev => [...prev, h.id]);
    } else {
      setSelectedIds(prev => prev.includes(h.id) ? prev.filter(x => x !== h.id) : [...prev, h.id]);
    }
  };

  const allEntries = [...pool, ...extraEntries];
  const selectedEntries = allEntries.filter(p => selectedIds.includes(p.id));
  const lockedPrompt = selectedEntries.length > 0 ? selectedEntries[0].prompt : null;
  const lockedNorm = lockedPrompt ? norm(lockedPrompt) : null;

  const filteredHistory = allHistory.filter(h =>
    !historyFilter ||
    h.question.toLowerCase().includes(historyFilter.toLowerCase()) ||
    h.model.toLowerCase().includes(historyFilter.toLowerCase())
  );
  // Group by normalized question so slight differences don't split groups
  const groupedHistory = filteredHistory.reduce((acc, h) => {
    const key = h.question.trim(); // preserve display text but group by trimmed
    if (!acc[key]) acc[key] = [];
    acc[key].push(h); return acc;
  }, {} as Record<string, HistoryEntry[]>);

  const runJudge = async () => {
    if (selectedEntries.length < 2) { setError('Select at least 2 responses to judge'); return; }
    if (judgeModel === 'custom' && !customJudgeUrl.trim()) {
      setError('Custom Endpoint selected — please enter your judge endpoint URL below the model selector.');
      return;
    }
    const prompt = selectedEntries[0].prompt;
    setJudging(true); setError(''); setResult(null); setSaved(false);
    try {
      const res = await fetch('/api/judge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          responses: selectedEntries.map(e => ({ label: e.label, model: e.model, content: e.content })),
          criteria, judgeModel,
          judgeEndpointUrl:     judgeModel === 'custom' ? customJudgeUrl   : undefined,
          judgeEndpointApiKey:  judgeModel === 'custom' ? customJudgeKey   : undefined,
          judgeEndpointModel:   judgeModel === 'custom' ? customJudgeModel : undefined,
          judgeEndpointHeaders: judgeModel === 'custom' ? customJudgeHeaders.filter(h => h.key.trim()) : undefined,
          judgeSkipSsl: judgeModel === 'custom' ? customJudgeSkipSsl : false,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else {
        setResult(data);
        saveJudgeResult({
          id: `judge-${Date.now()}`, timestamp: new Date().toLocaleString(),
          prompt, judgeModel: judgeModel === 'custom' ? (customJudgeModel || customJudgeUrl) : judgeModel,
          criteria: criteria || 'MT-Bench Default',
          responses: selectedEntries.map(e => ({ label: e.label, model: e.model })),
          winner: data.winner, reasoning: data.reasoning, scores: data.scores,
        });
        setSaved(true);
      }
    } catch (e) { setError(String(e)); }
    finally { setJudging(false); }
  };

  const dimensions = ['accuracy', 'relevance', 'coherence', 'helpfulness', 'safety'];

  return (
    <div className="space-y-6">
      {/* Two column layout: config left, results right */}
      <div className="grid gap-6" style={{gridTemplateColumns: result ? '1fr 1fr' : '1fr'}}>

        {/* LEFT: Config */}
        <div className="glass-dark rounded-2xl p-6 space-y-6">
          <h2 className="font-display font-bold text-2xl gradient-text-warm">⚖️ LLM Judge</h2>

          {/* Step 1 — Judge Model */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-3 font-mono" style={{color:"var(--text-secondary)"}}>① Select Judge Model</div>
            <div className="grid grid-cols-2 gap-2">
              {JUDGE_MODELS.map(m => (
                <button key={m.value} onClick={() => setJudgeModel(m.value)}
                  className="flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all"
                  style={judgeModel === m.value
                    ? {borderColor:'var(--judge)',background:'rgba(245,158,11,0.1)'}
                    : {borderColor:'var(--border)',background:'var(--bg-elevated)'}}>
                  <span className="text-xl">{m.badge}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold font-display truncate" style={{color:"var(--text-primary)"}}>{m.label.split('—')[0].trim()}</div>
                    <div className="text-xs truncate" style={{color:"var(--text-muted)"}}>{m.label.split('—')[1]?.trim()}</div>
                  </div>
                  {judgeModel === m.value && <span className="ml-auto text-xs" style={{color:"var(--judge)"}}>✓</span>}
                </button>
              ))}
            </div>
            {judgeModel === 'custom' && (
              <div className="mt-3 p-3 rounded-xl space-y-2" style={{background:"var(--bg-elevated)",border:"1px solid var(--border)"}}>
                <div className="text-[10px] font-semibold uppercase tracking-widest font-mono" style={{color:"var(--text-muted)"}}>Custom Judge Endpoint</div>
                <input value={customJudgeUrl} onChange={e => setCustomJudgeUrl(e.target.value)} placeholder="https://your-judge-api.com/v1" className="input-dark w-full px-2 py-1.5 text-xs" />
                <div className="flex gap-2">
                  <input type="password" value={customJudgeKey} onChange={e => setCustomJudgeKey(e.target.value)} placeholder="API Key" className="input-dark flex-1 px-2 py-1.5 text-xs" />
                  <input value={customJudgeModel} onChange={e => setCustomJudgeModel(e.target.value)} placeholder="Model name" className="input-dark flex-1 px-2 py-1.5 text-xs" />
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Select Responses */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-3 font-mono" style={{color:"var(--text-secondary)"}}>
              ② Select Responses <span style={{color:"var(--text-muted)",fontWeight:400}}>({selectedEntries.length} selected — same question only)</span>
            </div>

            {lockedPrompt && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2 mb-3" style={{background:"rgba(99,102,241,0.1)",border:"1px solid rgba(99,102,241,0.2)"}}>
                <span style={{color:"var(--accent)"}}>🔒</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-semibold mb-0.5" style={{color:"var(--accent)"}}>Locked to this question</div>
                  <div className="text-[10px] truncate" style={{color:"var(--accent)"}}>{lockedPrompt}</div>
                </div>
                <button onClick={() => { setSelectedIds([]); setExtraEntries([]); }} className="text-[10px] shrink-0" style={{color:"var(--accent)"}}>Clear</button>
              </div>
            )}

            <div className="flex gap-1 mb-3">
              <button onClick={() => setSelectionTab('pool')} className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={selectionTab==='pool' ? {background:"rgba(99,102,241,0.15)",color:"var(--accent)",fontWeight:600} : {color:"var(--text-muted)"}}>
                ➕ Pool {pool.length > 0 && `(${pool.length})`}
              </button>
              <button onClick={() => setSelectionTab('history')} className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={selectionTab==='history' ? {background:"rgba(99,102,241,0.15)",color:"var(--accent)",fontWeight:600} : {color:"var(--text-muted)"}}>
                📋 All Conversations {allHistory.length > 0 && `(${allHistory.length})`}
              </button>
            </div>

            {/* Pool */}
            {selectionTab === 'pool' && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pool.length === 0 ? (
                  <div className="text-xs text-center py-8 rounded-xl" style={{background:"var(--bg-elevated)",color:"var(--text-muted)"}}>
                    No responses in pool yet.<br/>Use ➕ Add to Judge on any response.
                  </div>
                ) : pool.map(entry => {
                  const isSelected = selectedIds.includes(entry.id);
                  const isDisabled = !!lockedPrompt && entry.prompt !== lockedPrompt && !isSelected;
                  return (
                    <div key={entry.id} onClick={() => !isDisabled && toggleId(entry.id)}
                      className="flex items-start gap-3 p-3 rounded-xl border transition-all"
                      style={{
                        opacity: isDisabled ? 0.4 : 1,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                        background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
                      }}>
                      <input type="checkbox" checked={isSelected} disabled={isDisabled} onChange={() => {}} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold font-display" style={{color:"var(--text-primary)"}}>{entry.label}</span>
                          <span className="text-[10px] font-mono px-1.5 rounded" style={{background:"var(--bg-card)",color:"var(--text-muted)"}}>{entry.model}</span>
                        </div>
                        <div className="text-xs truncate mb-1" style={{color:"var(--accent)"}}>Q: {entry.prompt}</div>
                        <div className="text-xs line-clamp-1" style={{color:"var(--text-muted)"}}>{entry.content.slice(0, 100)}...</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* History browser */}
            {selectionTab === 'history' && (
              <div className="space-y-2">
                <input value={historyFilter} onChange={e => setHistoryFilter(e.target.value)}
                  placeholder="🔍 Filter by question or model..."
                  className="input-dark w-full px-3 py-2 text-xs" />
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {Object.keys(groupedHistory).length === 0 ? (
                    <div className="text-xs text-center py-6 rounded-xl" style={{background:"var(--bg-elevated)",color:"var(--text-muted)"}}>
                      No conversations yet. Ask questions in any tab first.
                    </div>
                  ) : Object.entries(groupedHistory).map(([question, entries]) => {
                    const isLocked = !!lockedPrompt && lockedPrompt !== question;
                    return (
                      <div key={question} className="rounded-xl overflow-hidden" style={{opacity: isLocked ? 0.4 : 1, border:"1px solid var(--border)"}}>
                        <div className="px-3 py-2 text-xs font-semibold flex items-center gap-2"
                          style={{background: !isLocked ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)', color: !isLocked ? 'var(--accent)' : 'var(--text-muted)'}}>
                          {isLocked ? '🔒' : '✓'}
                          <span className="truncate flex-1">Q: {question}</span>
                        </div>
                        {entries.map(h => {
                          const isSelected = selectedIds.includes(h.id);
                          return (
                            <div key={h.id} onClick={() => !isLocked && addFromHistory(h)}
                              className="flex items-center gap-3 px-3 py-2 border-t transition-colors"
                              style={{
                                borderColor:"var(--border)",
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                              }}>
                              <input type="checkbox" checked={isSelected} disabled={isLocked} onChange={() => {}} className="shrink-0" />
                              <div className="flex-1 min-w-0 flex items-center gap-2">
                                <span className="text-[10px] font-medium font-display" style={{color:"var(--text-primary)"}}>{h.panel}</span>
                                <span className="text-[10px] font-mono truncate" style={{color:"var(--text-muted)"}}>{h.model}</span>
                                <span className="text-[10px] ml-auto shrink-0" style={{color:"var(--text-muted)"}}>{h.timestamp}</span>
                              </div>
                              {isSelected && <span className="text-[10px] shrink-0" style={{color:"var(--accent)"}}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Step 3 — Criteria */}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest mb-2 font-mono" style={{color:"var(--text-secondary)"}}>③ Evaluation Criteria</div>
            <select onChange={e => { setCriteria(e.target.value === 'custom' ? '' : e.target.value); }} className="select-dark w-full p-1.5 text-xs mb-2">
              {EVAL_CRITERIA_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
            </select>
            <textarea value={criteria} onChange={e => setCriteria(e.target.value)} rows={3}
              placeholder="Leave blank for MT-Bench default (accuracy, relevance, coherence, helpfulness, safety 1-10)."
              className="input-dark w-full p-3 text-xs resize-none" />
            {!criteria && <p className="text-[10px] mt-1" style={{color:"var(--text-muted)"}}>Using default: accuracy, relevance, coherence, helpfulness, safety (1-10)</p>}
          </div>

          {error && <div className="rounded-xl p-3 text-xs" style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.2)",color:"#ef4444"}}>❌ {error}</div>}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button onClick={runJudge} disabled={judging || selectedEntries.length < 2}
              className="btn-judge flex-1 px-4 py-3.5 text-base font-bold">
              {judging ? '⏳ Judging...' : `⚖️ Run Judge (${selectedEntries.length} responses)`}
            </button>
            {result && (
              <button onClick={runJudge} disabled={judging} className="btn-ghost px-4 py-3 text-sm">🔄 Re-run</button>
            )}
          </div>

          {saved && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.2)",color:"var(--openai)"}}>
              ✅ Saved — view in <button onClick={() => onNavigate('stats')} className="font-semibold underline ml-1">📊 Stats → Judge History</button>
            </div>
          )}
        </div>

        {/* RIGHT: Results */}
        {result && (
          <div className="glass-dark rounded-2xl p-6 space-y-5">
            <h3 className="font-display font-bold text-xl" style={{color:"var(--text-primary)"}}>Results</h3>

            {/* Winner */}
            <div className="rounded-2xl p-5 text-center" style={{background:"linear-gradient(135deg,rgba(245,158,11,0.1),rgba(249,115,22,0.05))",border:"1px solid rgba(245,158,11,0.2)"}}>
              <div className="text-3xl mb-2">🏆</div>
              <div className="font-display font-bold text-3xl gradient-text-warm">{result.winner} wins!</div>
              <div className="text-sm mt-3 leading-relaxed" style={{color:"var(--text-secondary)"}}>{result.reasoning}</div>
            </div>

            {/* Score table */}
            <div className="rounded-xl overflow-hidden" style={{border:"1px solid var(--border)"}}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{background:"var(--bg-card)"}}>
                    <th className="text-left p-3 font-mono text-xs uppercase tracking-widest" style={{color:"var(--text-muted)",borderBottom:"1px solid var(--border)"}}>Response</th>
                    {dimensions.map(d => (
                      <th key={d} className="text-center p-3 font-mono text-[10px] uppercase tracking-widest capitalize" style={{color:"var(--text-muted)",borderBottom:"1px solid var(--border)"}}>{d}</th>
                    ))}
                    <th className="text-center p-3 font-mono text-[10px] uppercase tracking-widest font-bold" style={{color:"var(--text-primary)",borderBottom:"1px solid var(--border)"}}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.scores).map(([label, scores]: [string, any]) => {
                    const isWinner = label === result.winner;
                    return (
                      <tr key={label} style={{background: isWinner ? 'rgba(245,158,11,0.08)' : 'var(--bg-elevated)'}}>
                        <td className="p-3" style={{borderBottom:"1px solid var(--border)"}}>
                          <div className="flex items-center gap-1.5">
                            {isWinner && <span>🏆</span>}
                            <span className="font-semibold font-display" style={{color:"var(--text-primary)"}}>{label}</span>
                          </div>
                        </td>
                        {dimensions.map(d => (
                          <td key={d} className="p-3 text-center" style={{borderBottom:"1px solid var(--border)"}}>
                            <span className="font-mono font-semibold" style={{color: scores[d] >= 8 ? 'var(--openai)' : scores[d] >= 6 ? 'var(--judge)' : '#ef4444'}}>
                              {scores[d]}
                            </span>
                          </td>
                        ))}
                        <td className="p-3 text-center" style={{borderBottom:"1px solid var(--border)"}}>
                          <span className="font-mono font-bold text-base" style={{color: scores.overall >= 8 ? 'var(--openai)' : scores.overall >= 6 ? 'var(--judge)' : '#ef4444'}}>
                            {scores.overall}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Score bars */}
            <div className="space-y-2">
              <div className="text-xs font-display font-semibold" style={{color:"var(--text-secondary)"}}>Score Comparison</div>
              {Object.entries(result.scores).map(([label, scores]: [string, any]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="text-xs font-display w-24 truncate" style={{color:"var(--text-secondary)"}}>{label}</div>
                  <div className="flex-1 rounded-full h-2" style={{background:"var(--bg-elevated)"}}>
                    <div className="h-2 rounded-full score-bar" style={{
                      width:`${(scores.overall/10)*100}%`,
                      background: label === result.winner
                        ? 'linear-gradient(90deg,#f59e0b,#f97316)'
                        : 'linear-gradient(90deg,var(--accent),#8b5cf6)'
                    }} />
                  </div>
                  <div className="text-xs font-mono w-8 text-right" style={{color:"var(--text-secondary)"}}>{scores.overall}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

