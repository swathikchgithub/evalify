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

import { StatusDot, AddToPoolButton, KeyValueEditor, PromptEditor, TeamEndpointPicker, SaveConfigModal } from './shared';
import { QueryInput } from './QueryInput';


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

// ── Custom Endpoint Tab ───────────────────────────────────────
export function CustomEndpointTab({ onMetric, onScore: onScoreParent, pool, onAddToPool, onRemoveFromPool, broadcastInput = '', broadcastTrigger = 0 }: {
  onMetric: (e: HistoryEntry) => void; onScore: (id: string, s: 'up' | 'down') => void;
  pool: PoolEntry[]; onAddToPool: (e: PoolEntry) => void; onRemoveFromPool: (id: string) => void;
  broadcastInput?: string; broadcastTrigger?: number;
}) {
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointApiKey, setEndpointApiKey] = useState('');
  const [endpointModel, setEndpointModel] = useState('');
  const [authType, setAuthType] = useState<'bearer' | 'header'>('bearer');
  const [skipSsl, setSkipSsl] = useState(false);
  const [headers, setHeaders] = useState<KeyValuePair[]>([{ key: '', value: '' }]);
  const [bodyFields, setBodyFields] = useState<KeyValuePair[]>([{ key: '', value: '' }]);
  const [complexity, setComplexity] = useState(1);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [input, setInput] = useState('');
  const [messageMetrics, setMessageMetrics] = useState<Record<string, PanelMetrics>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, 'up' | 'down'>>({});
  const [showConfig, setShowConfig] = useState(true);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const pendingRef = useRef<any>(null);

  useEffect(() => { setSavedConfigs(loadConfigs()); }, []);

  // Broadcast from Compare tab
  useEffect(() => {
    if (broadcastTrigger === 0 || !broadcastInput.trim() || !endpointUrl.trim()) return;
    setLastPrompt(broadcastInput);
    pendingRef.current = { startTime: Date.now(), level: isCustomPrompt ? '✏️ Custom' : COMPLEXITY_LABELS[complexity], model: endpointModel || endpointUrl, question: broadcastInput };
    append({ role: 'user', content: broadcastInput });
  }, [broadcastTrigger]);

  const { messages, append, isLoading, setMessages } = useChat({
    id: 'custom-endpoint', api: '/api/chat',
    onError: (e) => logError('custom endpoint error:', e),
    onFinish: (message, { usage }) => {
      const p = pendingRef.current;
      if (p) {
        const metrics = { responseTime: Date.now() - p.startTime, tokens: usage?.totalTokens ?? null, level: p.level, model: p.model };
        setMessageMetrics(prev => ({ ...prev, [message.id]: metrics }));
        onMetric({ id: message.id, question: p.question, panel: '🔌', model: p.model, level: p.level, responseTime: metrics.responseTime, tokens: metrics.tokens, cost: null, score: null, timestamp: new Date().toLocaleTimeString() });
        pendingRef.current = null;
      }
    },
    body: { endpointUrl, endpointApiKey, endpointModel, endpointHeaders: headers.filter(h => h.key.trim()), endpointBodyFields: bodyFields.filter(b => b.key.trim()), endpointAuthType: authType, endpointSkipSsl: skipSsl, complexity, customPrompt: isCustomPrompt ? customPrompt : null },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !endpointUrl.trim()) return;
    saveRecentQuery(input.trim());  // ← save here, in form handler
    setLastPrompt(input);
    pendingRef.current = { startTime: Date.now(), level: isCustomPrompt ? '✏️ Custom' : COMPLEXITY_LABELS[complexity], model: endpointModel || endpointUrl, question: input };
    append({ role: 'user', content: input });
    setInput('');
  };

  const handleSaveConfig = (name: string) => {
    const cfg: SavedConfig = { id: Date.now().toString(), name, endpointUrl, endpointApiKey, endpointModel, authType, skipSsl, headers, bodyFields, createdAt: new Date().toLocaleString() };
    const updated = [...savedConfigs, cfg]; setSavedConfigs(updated); saveConfigs(updated); setShowSaveModal(false);
  };
  const handleLoadConfig = (cfg: SavedConfig) => { setEndpointUrl(cfg.endpointUrl); setEndpointApiKey(cfg.endpointApiKey); setEndpointModel(cfg.endpointModel); setAuthType(cfg.authType as 'bearer' | 'header'); setSkipSsl(cfg.skipSsl); setHeaders(cfg.headers); setBodyFields(cfg.bodyFields); };
  const handleDeleteConfig = (id: string) => { const updated = savedConfigs.filter(c => c.id !== id); setSavedConfigs(updated); saveConfigs(updated); };

  return (
    <div style={{display:"flex", gap:"16px", alignItems:"flex-start"}}>
      {showSaveModal && <SaveConfigModal config={{ endpointUrl, endpointApiKey, endpointModel, authType, skipSsl, headers, bodyFields }} onSave={handleSaveConfig} onClose={() => setShowSaveModal(false)} />}
      <div style={{width: showConfig ? "320px" : "48px", flexShrink:0, background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:"16px", overflow:"hidden"}}>
        <div className="p-3 flex items-center justify-between" style={{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)"}}>
          {showConfig && <span className="text-xs font-semibold font-display" style={{color:"var(--text-primary)"}}>⚙️ OpenAI-Compatible Config</span>}
          <button onClick={() => setShowConfig(s => !s)} className="btn-ghost text-xs px-2 py-1 ml-auto">{showConfig ? '◀' : '▶'}</button>
        </div>
        {showConfig && (
          <div className="p-3 flex flex-col gap-3 overflow-y-auto max-h-[700px]" style={{background:"var(--bg-card)"}}>

            {/* Team Endpoints */}
            <TeamEndpointPicker type="custom" onLoad={cfg => {
              setEndpointUrl(cfg.url ?? '');
              setEndpointModel(cfg.model ?? '');
              setSkipSsl(cfg.skipSsl ?? false);
              setAuthType(cfg.authType ?? 'bearer');
              setEndpointApiKey(cfg.resolvedApiKey ?? '');
              if (cfg.headers?.length) setHeaders(cfg.headers);
              if (cfg.bodyFields?.length) setBodyFields(cfg.bodyFields);
            }} />

            {/* Saved Configs */}
            {savedConfigs.length > 0 && (
              <div>
                <label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>💾 Saved Configs</label>
                {savedConfigs.map(cfg => (
                  <div key={cfg.id} className="flex items-center gap-1 mb-1">
                    <button onClick={() => handleLoadConfig(cfg)} className="btn-ghost flex-1 text-left text-xs px-2 py-1 truncate">📁 {cfg.name}</button>
                    <button onClick={() => handleDeleteConfig(cfg.id)} className="text-red-400 hover:text-red-600 px-1 text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}

            <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>Endpoint URL *</label><input value={endpointUrl} onChange={e => setEndpointUrl(e.target.value)} placeholder="https://your-api.com/v1" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
            <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>Auth Type</label><select value={authType} onChange={e => setAuthType(e.target.value as 'bearer' | 'header')} className="select-dark w-full p-1.5 text-xs"><option value="bearer">Bearer Token</option><option value="header">API Key Header</option></select></div>
            <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>API Key</label><input type="password" value={endpointApiKey} onChange={e => setEndpointApiKey(e.target.value)} placeholder="Leave empty if not required" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
            <div><label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>Model Name</label><input value={endpointModel} onChange={e => setEndpointModel(e.target.value)} placeholder="e.g. gpt-4o-mini" className="input-dark w-full px-2 py-1.5 text-xs" /></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="skipSslOai" checked={skipSsl} onChange={e => setSkipSsl(e.target.checked)} /><label htmlFor="skipSslOai" className="text-xs text-gray-600">Skip SSL verification</label></div>
            <KeyValueEditor label="Extra Headers" pairs={headers} onChange={setHeaders} keyPlaceholder="Header name" valuePlaceholder="Value" />
            <KeyValueEditor label="Extra Body Fields" pairs={bodyFields} onChange={setBodyFields} keyPlaceholder="Field name" valuePlaceholder="Value (JSON or string)" />
            <div><div className="flex justify-between text-xs mb-1"><span style={{color:"var(--text-muted)"}}>Complexity:</span><span className="font-semibold" style={{color:"var(--text-primary)"}}>{COMPLEXITY_LABELS[complexity]}</span></div><input type="range" min={1} max={5} step={1} value={complexity} onChange={e => setComplexity(Number(e.target.value))} className="w-full accent-blue-500" /></div>
            <div>
              <div className="flex items-center justify-between mb-1"><label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">System Prompt</label><button onClick={() => setShowPromptEditor(s => !s)} className={`text-[10px] px-2 py-0.5 rounded border ${isCustomPrompt ? 'bg-purple-100 border-purple-400 text-purple-600' : 'border-gray-200'}`}>{showPromptEditor ? 'Hide' : 'Edit ✏️'}</button></div>
              {showPromptEditor && <PromptEditor complexity={complexity} customPrompt={customPrompt} isCustomPrompt={isCustomPrompt} onCustomPromptChange={setCustomPrompt} onIsCustomChange={setIsCustomPrompt} />}
              {isCustomPrompt && !showPromptEditor && <div className="text-[10px] text-purple-600 bg-purple-50 rounded px-2 py-1">✏️ Custom prompt active</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(true)} disabled={!endpointUrl.trim()} className="btn-ghost flex-1 text-xs px-3 py-1.5" style={{borderColor:"rgba(99,102,241,0.3)",color:"var(--accent)"}}>💾 Save</button>
              <button onClick={() => { setMessages([]); setMessageMetrics({}); setScores({}); }} className="btn-ghost flex-1 text-xs px-3 py-1.5">🗑 Clear</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col glass-dark rounded-2xl overflow-hidden" style={{flex:1, minWidth:0}}>
        <div className="p-3" style={{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)"}}>
          <div className="text-xs font-semibold font-display flex items-center gap-2" style={{color:"var(--text-primary)"}}>🔌 OpenAI-Compatible{endpointUrl && <span className="text-blue-500 font-normal text-[10px] truncate max-w-xs">{endpointUrl}</span>}</div>
          {!endpointUrl && <div className="text-[10px] mt-1" style={{color:"#f97316"}}>⚠️ Configure endpoint URL in the config panel</div>}
        </div>
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center flex-1 py-16 gap-3 select-none">
          <div className="text-4xl" style={{opacity:0.3}}>🔌</div>
          <div className="font-display font-semibold text-sm" style={{color:"var(--text-muted)"}}>Custom Endpoint</div>
          <div className="text-[10px] text-center max-w-[160px]" style={{color:"var(--text-muted)",opacity:0.6}}>Configure your endpoint URL and send a query</div>
          <div className="w-8 h-px" style={{background:"linear-gradient(90deg,transparent,var(--custom),transparent)"}}/>
        </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{minHeight:"400px", maxHeight:"calc(100vh - 380px)"}}>
            {messages.map(m => (
              <div key={m.id}>
                <div className={`p-4 text-sm leading-relaxed ${m.role === 'user' ? 'bubble-user ml-4' : 'bubble-assistant mr-4'}`} style={{overflowWrap:"break-word", wordBreak:"break-word", minWidth:0}}>
                  <span className="font-semibold uppercase tracking-wide text-gray-400 block mb-1 text-[10px]">{m.role === 'user' ? 'You' : '🔌 Endpoint'}</span>
                  <div className="prose-dark prose-xs max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
                </div>
                {m.role === 'assistant' && (
                  <div className="flex items-center justify-between mt-2 mr-4 px-1 pt-2" style={{borderTop:"1px solid var(--border)"}}>
                    <div className="flex gap-2 text-[10px] text-gray-400">{messageMetrics[m.id] && (
                    <>
                      <span className="font-mono text-[11px]" style={{color:"var(--text-muted)"}}>⏱ {messageMetrics[m.id].responseTime}ms</span>
                      <span className="font-mono text-[11px]" style={{color:"var(--text-muted)"}}>◈ {messageMetrics[m.id].tokens ?? '—'} tok</span>
                    </>
                  )}</div>
                    <div className="flex gap-1 items-center flex-wrap">
                      <AddToPoolButton entry={{ label: `Custom: ${endpointModel || 'endpoint'}`, model: endpointModel || endpointUrl, content: m.content, prompt: lastPrompt, tab: 'openai', timestamp: new Date().toLocaleTimeString() }} pool={pool} onAdd={onAddToPool} onRemove={onRemoveFromPool} />
                      <button onClick={() => { setScores(p => ({ ...p, [m.id]: 'up' })); onScoreParent(m.id, 'up'); }} className={`text-[10px] px-2 py-0.5 rounded border ${scores[m.id] === 'up' ? 'bg-green-100 border-green-400 text-green-600' : 'border-gray-200 hover:text-green-500'}`}>👍</button>
                      <button onClick={() => { setScores(p => ({ ...p, [m.id]: 'down' })); onScoreParent(m.id, 'down'); }} className={`text-[10px] px-2 py-0.5 rounded border ${scores[m.id] === 'down' ? 'bg-red-100 border-red-400 text-red-600' : 'border-gray-200 hover:text-red-500'}`}>👎</button>
                      <button onClick={() => { navigator.clipboard.writeText(m.content); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 2000); }} className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:text-blue-500">{copiedId === m.id ? '✅' : '📋'}</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {isLoading && <div className="p-3 bubble-assistant mr-6 flex items-center gap-1.5"><div className="thinking-dot"/><div className="thinking-dot"/><div className="thinking-dot"/></div>}
          </div>
        )}
        <form onSubmit={onSubmit} className="p-3 border-t flex gap-2">
          <QueryInput
            value={input}
            onChange={setInput}
            onSubmit={() => { if (input.trim() && endpointUrl.trim()) { saveRecentQuery(input.trim()); setLastPrompt(input); pendingRef.current = { startTime: Date.now(), level: isCustomPrompt ? '✏️ Custom' : COMPLEXITY_LABELS[complexity], model: endpointModel || endpointUrl, question: input }; append({ role: 'user', content: input }); setInput(''); } }}
            placeholder={endpointUrl ? 'Ask your endpoint... (💡 for sample questions)' : 'Configure endpoint URL first...'}
          />
          <button type="submit" disabled={!input.trim() || !endpointUrl.trim() || isLoading} className="btn-primary px-4 py-2 text-sm whitespace-nowrap">Send</button>
        </form>
      </div>
    </div>
  );
}

