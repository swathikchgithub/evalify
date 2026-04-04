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

import { StatusDot, AddToPoolButton, PromptEditor } from './shared';


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

// ── ChatPanel ─────────────────────────────────────────────────
export function ChatPanel({ panelId, sharedInput, submitTrigger, onMetric, onScore: onScoreParent, pool, onAddToPool, onRemoveFromPool, modelStatuses, onModelStatus, clearTrigger = 0, onRegisterClear, isActive = true, onModelChange }: {
  panelId: string; sharedInput: string; submitTrigger: number;
  onMetric: (e: HistoryEntry) => void; onScore: (id: string, s: 'up' | 'down') => void;
  pool: PoolEntry[]; onAddToPool: (e: PoolEntry) => void; onRemoveFromPool: (id: string) => void;
  modelStatuses: Record<string, ModelStatus>; onModelStatus: (model: string, status: ModelStatus) => void;
  clearTrigger?: number;
  onRegisterClear?: (panelId: string, fn: () => void) => void;
  isActive?: boolean;
  onModelChange?: (panelId: string, model: string) => void;
}) {
  const [model, setModel] = useState(panelId === 'A' ? 'gpt-4o-mini' : panelId === 'B' ? 'claude-haiku-4-5-20251001' : panelId === 'C' ? 'llama-3.3-70b-versatile' : 'gemini-2.5-flash');

  // Notify parent of model changes so panel selector can show real names
  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    onModelChange?.(panelId, newModel);
  };
  const [complexity, setComplexity] = useState(1); // Default Age 5 — simplest, most approachable
  const [messageMetrics, setMessageMetrics] = useState<Record<string, PanelMetrics>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, 'up' | 'down'>>({});
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [isCustomPrompt, setIsCustomPrompt] = useState(false);
  const [lastPrompt, setLastPrompt]   = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens]     = useState(500);
  const [topP, setTopP]               = useState(1.0);
  const pendingRef = useRef<any>(null);
  const modelRef = useRef(model); const complexityRef = useRef(complexity);
  useEffect(() => { modelRef.current = model; }, [model]);
  useEffect(() => { complexityRef.current = complexity; }, [complexity]);

  const { messages, append, isLoading, setMessages } = useChat({
    id: `panel-${panelId}`, api: '/api/chat',
    onError: (e) => { logError('panel error:', e); onModelStatus(modelRef.current, 'error'); },
    onFinish: (message, { usage }) => {
      onModelStatus(modelRef.current, 'online');
      const p = pendingRef.current;
      if (p) {
        const pricing = MODEL_PRICING[p.model];
        const cost = pricing && usage?.totalTokens ? usage.totalTokens * pricing.output : null;
        const metrics = { responseTime: Date.now() - p.startTime, tokens: usage?.totalTokens ?? null, level: p.level, model: p.model };
        setMessageMetrics(prev => ({ ...prev, [message.id]: metrics }));
        onMetric({ id: message.id, question: p.question, panel: panelId, model: p.model, level: p.level, responseTime: metrics.responseTime, tokens: metrics.tokens, cost, score: null, timestamp: new Date().toLocaleTimeString() });
        pendingRef.current = null;
      }
    },
    body: { model, complexity, customPrompt: isCustomPrompt ? customPrompt : null, temperature, maxTokens, topP },
  });

  // Clear panel when Clear All button is clicked
  // Register this panel's clear function with the parent
  useEffect(() => {
    if (!onRegisterClear) return;
    onRegisterClear(panelId, () => {
      setMessages([]);
      setMessageMetrics({});
      setScores({});
      setLastPrompt('');
      pendingRef.current = null;
    });
  }, [onRegisterClear, panelId]);

  // Also keep the trigger pattern as a fallback
  useEffect(() => {
    if (clearTrigger === 0) return;
    setMessages([]);
    setMessageMetrics({});
    setScores({});
    setLastPrompt('');
    pendingRef.current = null;
  }, [clearTrigger]);

  useEffect(() => {
    if (submitTrigger === 0 || !sharedInput.trim()) return;
    setLastPrompt(sharedInput);
    pendingRef.current = { startTime: Date.now(), level: isCustomPrompt ? '✏️ Custom' : COMPLEXITY_LABELS[complexityRef.current], model: modelRef.current, question: sharedInput };
    append({ role: 'user', content: sharedInput });
  }, [submitTrigger]);

  const provider = getProviderInfo(model);
  return (
    <div className="flex flex-col glass-dark rounded-xl sm:rounded-2xl overflow-hidden transition-opacity" style={{borderTop:`2px solid ${provider.color}`, minWidth:0, width:"100%", overflow:"hidden", opacity: isActive ? 1 : 0.4}}>
      <div className="p-4 flex flex-col gap-2" style={{background:"var(--bg-elevated)",borderBottom:"1px solid var(--border)"}}>
        {/* Model name + provider badge */}
        <div className="flex items-center gap-2 mb-1">
          <StatusDot status={modelStatuses[model] ?? 'untested'} />
          <span className="font-display font-bold text-base flex-1 truncate" style={{color:"var(--text-primary)"}}>
            {MODELS.find(m => m.value === model)?.label.split(' (')[0] ?? model}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${provider.badge}`}>
            {provider.name}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <select value={model} onChange={e => handleModelChange(e.target.value)} className="select-dark flex-1 p-1.5 text-[11px]" style={{opacity:0.7}}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button onClick={() => setShowPromptEditor(s => !s)} className={`btn-ghost text-xs px-2 py-1`} style={isCustomPrompt ? {borderColor:'#a855f7',color:'#a855f7',background:'rgba(168,85,247,0.1)'} : {}}>✏️</button>
          <button onClick={() => { setMessages([]); setMessageMetrics({}); setScores({}); }} className="btn-ghost text-xs px-2 py-1">🗑</button>
        </div>
        {showPromptEditor && <PromptEditor complexity={complexity} customPrompt={customPrompt} isCustomPrompt={isCustomPrompt} onCustomPromptChange={setCustomPrompt} onIsCustomChange={setIsCustomPrompt} />}
        {!isCustomPrompt && (
          <div>
            <div className="flex justify-between text-xs mb-1"><span style={{color:"var(--text-muted)"}}>Complexity:</span><span className="font-semibold" style={{color:"var(--text-primary)"}}>{COMPLEXITY_LABELS[complexity]}</span></div>
            <input type="range" min={1} max={5} step={1} value={complexity} onChange={e => setComplexity(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
        )}
        {isCustomPrompt && !showPromptEditor && (
          <div className="text-[10px] rounded px-2 py-1 flex items-center justify-between" style={{background:"rgba(168,85,247,0.1)",color:"#a855f7",border:"1px solid rgba(168,85,247,0.2)"}}>
            <span>✏️ Custom prompt active</span>
            <button onClick={() => { setCustomPrompt(''); setIsCustomPrompt(false); }} className="text-purple-400 ml-2">✕</button>
          </div>
        )}
        {/* ── Advanced params — always visible ── */}
        <div className="space-y-2 pt-1">
          <div>
            <div className="flex justify-between text-[10px] mb-0.5" style={{color:"var(--text-muted)"}}>
              <span>Temperature</span><span className="font-mono font-semibold" style={{color:"var(--text-primary)"}}>{temperature}</span>
            </div>
            <input type="range" min={0} max={model.startsWith('claude') ? 1 : 2} step={0.1} value={temperature} onChange={e => setTemperature(Number(e.target.value))} className="w-full accent-blue-500"/>
            <div className="flex justify-between text-[9px]" style={{color:"var(--text-muted)"}}><span>0 precise</span><span>1 balanced</span><span>2 creative</span></div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-0.5" style={{color:"var(--text-muted)"}}>
              <span>Max tokens</span><span className="font-mono font-semibold" style={{color:"var(--text-primary)"}}>{maxTokens}</span>
            </div>
            <input type="range" min={100} max={4000} step={100} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} className="w-full accent-blue-500"/>
            <div className="flex justify-between text-[9px]" style={{color:"var(--text-muted)"}}><span>100</span><span>2000</span><span>4000</span></div>
          </div>
          <div>
            <div className="flex justify-between text-[10px] mb-0.5" style={{color:"var(--text-muted)"}}>
              <span>Top-p</span><span className="font-mono font-semibold" style={{color:"var(--text-primary)"}}>{topP}</span>
            </div>
            <input type="range" min={0.1} max={1} step={0.05} value={topP} onChange={e => setTopP(Number(e.target.value))} className="w-full accent-blue-500"/>
            <div className="flex justify-between text-[9px]" style={{color:"var(--text-muted)"}}><span>0.1 focused</span><span>0.5</span><span>1.0 diverse</span></div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-[280px] sm:min-h-[400px] max-h-[480px] sm:max-h-[680px] message-area" style={{minWidth:0, overflowX:"hidden"}}>
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-3 select-none">
            <div className="text-4xl opacity-20" style={{filter:"grayscale(0.3)"}}>
              {provider.name === 'OpenAI' ? '🟢' : provider.name === 'Anthropic' ? '🟠' : provider.name === 'Groq' ? '🟣' : '🔵'}
            </div>
            <div className="text-xs font-display font-semibold" style={{color:"var(--text-muted)"}}>
              {MODELS.find(m => m.value === model)?.label.split(' (')[0]}
            </div>
            <div className="text-[10px] text-center max-w-[120px]" style={{color:"var(--text-muted)",opacity:0.6}}>
              Ask a question to see the response here
            </div>
            <div className="w-8 h-px mt-1" style={{background:`linear-gradient(90deg, transparent, ${provider.color}, transparent)`}} />
          </div>
        )}
        {messages.map(m => (
          <div key={m.id}>
            <div className={`p-4 text-sm leading-relaxed ${m.role === 'user' ? 'bubble-user ml-4' : 'bubble-assistant mr-4'}`} style={{overflowWrap:"break-word", wordBreak:"break-word", minWidth:0}}>
              <span className="font-mono text-[11px] uppercase tracking-wider block mb-2 font-semibold" style={{color:"var(--text-muted)"}}>{m.role === 'user' ? 'You' : '🤖'}</span>
              <div className="prose-dark prose-xs max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div>
            </div>
            {m.role === 'assistant' && (
              <div className="flex items-center justify-between mt-2 mr-4 px-1 pt-2" style={{borderTop:"1px solid var(--border)"}}>
                <div className="flex flex-wrap gap-2 text-[10px]" style={{color:"var(--text-muted)"}}>
                  {messageMetrics[m.id] && (
                    <>
                      <span className="font-mono text-[11px]" style={{color:"var(--text-muted)"}}>⏱ {messageMetrics[m.id].responseTime}ms</span>
                      <span className="font-mono text-[11px]" style={{color:"var(--text-muted)"}}>◈ {messageMetrics[m.id].tokens ?? '—'} tok</span>
                    </>
                  )}
                </div>
                <div className="flex gap-1 items-center flex-wrap">
                  <AddToPoolButton
                    entry={{ label: `${panelId} — ${MODELS.find(m => m.value === model)?.label.split(' (')[0] ?? model}`, model, content: m.content, prompt: lastPrompt, tab: 'compare', timestamp: new Date().toLocaleTimeString() }}
                    pool={pool} onAdd={onAddToPool} onRemove={onRemoveFromPool}
                  />
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
    </div>
  );
}

