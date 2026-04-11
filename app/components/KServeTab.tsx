'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useChat } from 'ai/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ModelStatus, PanelMetrics, HistoryEntry, KeyValuePair, SavedConfig, PoolEntry, JudgeResult, ActiveTab } from '../../types/evalify-types';
import { MODELS, JUDGE_MODELS, KNOWN_CUSTOM_MODELS, MODEL_PRICING, DEFAULT_COMPLEXITY, COMPLEXITY_LABELS, COMPLEXITY_MAP, PROMPT_PRESETS, STORAGE_KEY_QUERIES, STORAGE_KEY_CONFIGS, MAX_RECENT_QUERIES, DEFAULT_PANEL_MODELS } from '../../config/evalify-constants';
import { KSERVE_PRESETS, EVAL_CRITERIA_PRESETS } from '../../config/evalify-kserve-presets';

import { StatusDot, AddToPoolButton, TabGuide, KeyValueEditor, TeamEndpointPicker, SaveConfigModal } from './shared';
import { QueryInput } from './QueryInput';

const DEBUG = false;
const log = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => DEBUG && console.error(...args);

function resolveApiKey(envVar?: string): string {
  if (!envVar) return '';
  return (process.env as any)[envVar] || '';
}

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
  if (model.startsWith('kserve-') || model === 'kserve') return 'kserve';
  if (model.includes('/')) return 'openrouter';
  return 'custom';
}
function getModelBadgeClass(model: string): string { return `badge-${getModelColor(model)}`; }
function getPanelBorderClass(model: string): string { return `panel-${getModelColor(model)}`; }

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

export function KServeTab({ onMetric, onScore: onScoreParent, pool, onAddToPool, onRemoveFromPool, broadcastInput = '', broadcastTrigger = 0 }: {
  onMetric: (e: HistoryEntry) => void; onScore: (id: string, s: 'up' | 'down') => void;
  pool: PoolEntry[]; onAddToPool: (e: PoolEntry) => void; onRemoveFromPool: (id: string) => void;
  broadcastInput?: string; broadcastTrigger?: number;
}) {
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointApiKey, setEndpointApiKey] = useState('');
  const [authType, setAuthType] = useState<'bearer' | 'header'>('bearer');
  const [skipSsl, setSkipSsl] = useState(false);
  const [headers, setHeaders] = useState<KeyValuePair[]>([{ key: '', value: '' }]);
  const [kserveModel, setKserveModel] = useState('');
  const [kserveTemplate, setKserveTemplate] = useState('');
  const [kserveOutputField, setKserveOutputField] = useState('response');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [input, setInput] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messageMetrics, setMessageMetrics] = useState<Record<string, PanelMetrics>>({});
  const [scores, setScores] = useState<Record<string, 'up' | 'down'>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');

  useEffect(() => { setSavedConfigs(loadConfigs()); }, []);

  useEffect(() => {
    if (broadcastTrigger === 0 || !broadcastInput.trim() || !endpointUrl.trim() || !kserveModel.trim() || !kserveTemplate.trim()) return;
    const question = broadcastInput;
    setLastPrompt(question);
    setMessages(prev => [...prev, { id: `user-broadcast-${Date.now()}`, role: 'user' as const, content: question }]);
    setIsLoading(true);
    const startTime = Date.now();
    fetch('/api/kserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpointUrl, endpointApiKey, endpointAuthType: authType, endpointSkipSsl: skipSsl, endpointHeaders: headers.filter(h => h.key.trim()), kserveModel, kserveTemplate, kserveOutputField, query: question }),
    }).then(async r => {
      if (!r.ok) return;
      const reader = r.body!.getReader(); const decoder = new TextDecoder(); let fullContent = '';
      const assistantId = `assistant-broadcast-${Date.now()}`;
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant' as const, content: '' }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('0:')) { try { fullContent += JSON.parse(line.slice(2)); setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m)); } catch { } }
        }
      }
      const elapsed = Date.now() - startTime;
      setMessageMetrics(prev => ({ ...prev, [assistantId]: { responseTime: elapsed, tokens: null, level: '🧬 KServe v2', model: kserveModel } }));
      onMetric({ id: assistantId, question, panel: '🧬', model: kserveModel, level: 'KServe v2', responseTime: elapsed, tokens: null, cost: null, score: null, timestamp: new Date().toLocaleTimeString() });
    }).catch(() => { }).finally(() => setIsLoading(false));
  }, [broadcastTrigger]);

  const handlePresetChange = (label: string) => {
    const preset = KSERVE_PRESETS.find(p => p.label === label);
    if (preset) { setSelectedPreset(label); setKserveModel(preset.model); setKserveOutputField(preset.outputField); setKserveTemplate(preset.template); }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !endpointUrl.trim() || !kserveTemplate.trim() || !kserveModel.trim()) return;
    const question = input;
    saveRecentQuery(question.trim());
    setLastPrompt(question);
    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', content: question }]);
    setInput(''); setIsLoading(true); setError('');
    const startTime = Date.now();
    try {
      const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (endpointApiKey) fetchHeaders[authType === 'header' ? 'api-key' : 'Authorization'] = authType === 'header' ? endpointApiKey : `Bearer ${endpointApiKey}`;
      headers.filter(h => h.key.trim()).forEach(h => { fetchHeaders[h.key.trim()] = h.value; });
      const response = await fetch('/api/kserve', {
        method: 'POST', headers: fetchHeaders,
        body: JSON.stringify({ endpointUrl, endpointApiKey, endpointAuthType: authType, endpointSkipSsl: skipSsl, endpointHeaders: headers.filter(h => h.key.trim()), kserveModel, kserveTemplate, kserveOutputField, query: question }),
      });
      if (!response.ok) { const err = await response.json(); setError(err.error || 'Request failed'); setIsLoading(false); return; }
      const reader = response.body!.getReader(); const decoder = new TextDecoder(); let fullContent = '';
      const assistantId = `assistant-${Date.now()}`;
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (line.startsWith('0:')) { try { fullContent += JSON.parse(line.slice(2)); setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m)); } catch { } }
        }
      }
      const elapsed = Date.now() - startTime;
      setMessageMetrics(prev => ({ ...prev, [assistantId]: { responseTime: elapsed, tokens: null, level: '🧬 KServe v2', model: kserveModel } }));
      onMetric({ id: assistantId, question, panel: '🧬', model: kserveModel, level: 'KServe v2', responseTime: elapsed, tokens: null, cost: null, score: null, timestamp: new Date().toLocaleTimeString() });
    } catch (err) { setError(String(err)); }
    finally { setIsLoading(false); }
  };

  const handleSaveConfig = (name: string) => {
    const cfg: SavedConfig = { id: Date.now().toString(), name, endpointUrl, endpointApiKey, endpointModel: kserveModel, authType, skipSsl, headers, bodyFields: [], createdAt: new Date().toLocaleString() };
    const updated = [...savedConfigs, cfg]; setSavedConfigs(updated); saveConfigs(updated); setShowSaveModal(false);
  };
  const handleLoadConfig = (cfg: SavedConfig) => { setEndpointUrl(cfg.endpointUrl); setEndpointApiKey(cfg.endpointApiKey); setAuthType(cfg.authType as 'bearer' | 'header'); setSkipSsl(cfg.skipSsl); setHeaders(cfg.headers); };
  const handleDeleteConfig = (id: string) => { const updated = savedConfigs.filter(c => c.id !== id); setSavedConfigs(updated); saveConfigs(updated); };

  return (
    <>
      <TabGuide id="kserve" title="How to use KServe v2" steps={[
        { icon: '🔗', title: 'Enter URL', desc: 'Your KServe server URL — /v2/models/{model}/infer is added automatically.', color: '#ec4899' },
        { icon: '📋', title: 'Pick Preset', desc: 'Select from 18+ built-in presets: chat, moderation, summarization, embeddings.', color: '#6366f1' },
        { icon: '✏️', title: 'Customize', desc: 'Edit the request template if needed. Use {{query}} as placeholder for your input.', color: '#f97316' },
        { icon: '📡', title: 'Send', desc: 'Type a question and click Infer, or use 📡 All from the Compare tab.', color: '#10b981' },
      ]} tip="KServe v2 uses a different inference protocol than OpenAI — use this tab for ML inference servers." />

      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
        {showSaveModal && <SaveConfigModal config={{ endpointUrl, endpointApiKey, endpointModel: kserveModel, authType, skipSsl, headers, bodyFields: [] }} onSave={handleSaveConfig} onClose={() => setShowSaveModal(false)} />}
        <div style={{ width: showConfig ? "320px" : "48px", flexShrink: 0, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "16px", overflow: "hidden" }}>
          <div className="p-3 flex items-center justify-between" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            {showConfig && <span className="text-xs font-semibold font-display" style={{ color: "var(--text-primary)" }}>⚙️ KServe v2 Config</span>}
            <button onClick={() => setShowConfig(s => !s)} className="btn-ghost text-xs px-2 py-1 ml-auto">{showConfig ? '◀' : '▶'}</button>
          </div>
          {showConfig && (
            <div className="p-3 flex flex-col gap-3 overflow-y-auto max-h-[750px]" style={{ background: "var(--bg-card)" }}>
              <TeamEndpointPicker type="kserve" onLoad={cfg => {
                setEndpointUrl(cfg.url ?? '');
                setSkipSsl(cfg.skipSsl ?? false);
                setAuthType(cfg.authType ?? 'bearer');
                setEndpointApiKey(cfg.resolvedApiKey ?? '');
                if (cfg.headers?.length) setHeaders(cfg.headers);
              }} />
              {savedConfigs.length > 0 && (
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Saved Configs</label>
                  {savedConfigs.map(cfg => (
                    <div key={cfg.id} className="flex items-center gap-1 mb-1">
                      <button onClick={() => handleLoadConfig(cfg)} className="btn-ghost flex-1 text-left text-xs px-2 py-1 truncate">📁 {cfg.name}</button>
                      <button onClick={() => handleDeleteConfig(cfg.id)} className="text-red-400 hover:text-red-600 px-1 text-xs">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Endpoint URL *</label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://your-mlserver.com" className="input-dark w-full px-2 py-1.5 text-xs" /><p className="text-[10px] text-gray-400 mt-1">/v2/models/&#123;model&#125;/infer appended</p></div>
              <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Auth Type</label><select value={authType} onChange={e => setAuthType(e.target.value as 'bearer' | 'header')} className="select-dark w-full p-1.5 text-xs"><option value="bearer">Bearer Token</option><option value="header">API Key Header</option></select></div>
              <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>API Key</label><input type="password" value={endpointApiKey} onChange={e => setEndpointApiKey(e.target.value)} placeholder="Leave empty if VPN/network auth" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" id="skipSslKs" checked={skipSsl} onChange={e => setSkipSsl(e.target.checked)} /><label htmlFor="skipSslKs" className="text-xs text-gray-600">Skip SSL verification</label></div>
              <KeyValueEditor label="Extra Headers" pairs={headers} onChange={setHeaders} keyPlaceholder="Header name" valuePlaceholder="Value" />
              <div className="border-t pt-3">
                <label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Model Preset</label>
                <select value={selectedPreset} onChange={e => handlePresetChange(e.target.value)} className="select-dark w-full p-1.5 text-xs">
                  <option value="">Select a preset...</option>
                  {KSERVE_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                {selectedPreset && <p className="text-[10px] text-gray-400 mt-1">{KSERVE_PRESETS.find(p => p.label === selectedPreset)?.description}</p>}
              </div>
              <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Model Name *</label><input value={kserveModel} onChange={e => setKserveModel(e.target.value)} placeholder="e.g. your-model-name" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
              <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{ color: "var(--text-muted)" }}>Output Field</label><input value={kserveOutputField} onChange={e => setKserveOutputField(e.target.value)} placeholder="response, answer, summary, code" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
              <div>
                <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Request Template *</label><span className="text-[10px] text-blue-500">&#123;&#123;query&#125;&#125; = input</span></div>
                <textarea value={kserveTemplate} onChange={e => setKserveTemplate(e.target.value)} rows={6} className="input-dark w-full p-2 text-[10px] font-mono resize-y" style={{ color: "var(--text-primary)" }} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSaveModal(true)} disabled={!endpointUrl.trim()} className="btn-ghost flex-1 text-xs px-3 py-1.5" style={{ borderColor: "rgba(99,102,241,0.3)", color: "var(--accent)" }}>💾 Save</button>
                <button onClick={() => { setMessages([]); setMessageMetrics({}); setScores({}); setError(''); }} className="btn-ghost flex-1 text-xs px-3 py-1.5">🗑 Clear</button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col glass-dark rounded-2xl overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
          <div className="p-3" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            <div className="text-xs font-semibold font-display flex items-center gap-2 flex-wrap" style={{ color: "var(--text-primary)" }}>🧬 KServe v2{kserveModel && <span className="badge-kserve font-mono text-[10px] px-2 py-0.5 rounded-lg">{kserveModel}</span>}</div>
            {!endpointUrl && <div className="text-[10px] mt-1" style={{ color: "#f97316" }}>⚠️ Configure endpoint URL and select a model preset</div>}
          </div>
          {messages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 gap-3 select-none">
              <div className="text-4xl" style={{ opacity: 0.3 }}>🧬</div>
              <div className="font-display font-semibold text-sm" style={{ color: "var(--text-muted)" }}>KServe v2</div>
              <div className="text-[10px] text-center" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{KSERVE_PRESETS.length} presets available</div>
              <div className="w-8 h-px" style={{ background: "linear-gradient(90deg,transparent,var(--kserve),transparent)" }} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[400px] max-h-[600px]">
              {messages.map(m => (
                <div key={m.id}>
                  <div className={`p-4 text-sm leading-relaxed ${m.role === 'user' ? 'bubble-user ml-4' : 'bubble-assistant mr-4'}`} style={{ overflowWrap: "break-word", wordBreak: "break-word", minWidth: 0 }}>
                    <span className="font-semibold uppercase tracking-wide text-gray-400 block mb-1 text-[10px]">{m.role === 'user' ? 'You' : `🧬 ${kserveModel}`}</span>
                    <div className="prose-dark prose-xs max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                  </div>
                  {m.role === 'assistant' && (
                    <div className="flex items-center justify-between mt-2 mr-4 px-1 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="flex gap-2 text-[10px] text-gray-400">{messageMetrics[m.id] && <span>⏱ {messageMetrics[m.id].responseTime}ms</span>}</div>
                      <div className="flex gap-1 items-center flex-wrap">
                        <AddToPoolButton entry={{ label: `KServe: ${kserveModel}`, model: kserveModel, content: m.content, prompt: lastPrompt, tab: 'kserve', timestamp: new Date().toLocaleTimeString() }} pool={pool} onAdd={onAddToPool} onRemove={onRemoveFromPool} />
                        <button onClick={() => { setScores(p => ({ ...p, [m.id]: 'up' })); onScoreParent(m.id, 'up'); }} className={`text-[10px] px-2 py-0.5 rounded border ${scores[m.id] === 'up' ? 'bg-green-100 border-green-400 text-green-600' : 'border-gray-200 hover:text-green-500'}`}>👍</button>
                        <button onClick={() => { setScores(p => ({ ...p, [m.id]: 'down' })); onScoreParent(m.id, 'down'); }} className={`text-[10px] px-2 py-0.5 rounded border ${scores[m.id] === 'down' ? 'bg-red-100 border-red-400 text-red-600' : 'border-gray-200 hover:text-red-500'}`}>👎</button>
                        <button onClick={() => { const msg = messages.find(mm => mm.id === m.id); if (msg) { navigator.clipboard.writeText(msg.content); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 2000); } }} className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:text-blue-500">{copiedId === m.id ? '✅' : '📋'}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && <div className="p-3 bg-gray-50 border rounded-xl mr-6 text-xs text-gray-400 animate-pulse">Calling inference endpoint...</div>}
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl mr-6 text-xs text-red-600">❌ {error}</div>}
            </div>
          )}
          <form onSubmit={onSubmit} className="p-3 border-t flex gap-2">
            <QueryInput
              value={input}
              onChange={setInput}
              onSubmit={() => { if (input.trim() && endpointUrl.trim() && kserveModel.trim() && kserveTemplate.trim()) { saveRecentQuery(input.trim()); onSubmit({ preventDefault: () => { } } as any); } }}
              placeholder={!endpointUrl.trim() ? 'Configure endpoint URL first...' : !kserveModel.trim() ? 'Select a model preset first...' : 'Enter your query... (💡 for sample questions)'}
            />
            <button type="submit" disabled={!input.trim() || !endpointUrl.trim() || !kserveModel.trim() || !kserveTemplate.trim() || isLoading} className="btn-primary px-4 py-2 text-sm whitespace-nowrap">Infer</button>
          </form>
        </div>
      </div>
    </>
  );
}
