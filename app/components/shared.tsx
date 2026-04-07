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


const DEBUG = false;
const log      = (...args: any[]) => DEBUG && console.log(...args);
const logError = (...args: any[]) => DEBUG && console.error(...args);

// ── Resolve API key ─────────────────────────────────────────────
export function resolveApiKey(envVar?: string): string {
  if (!envVar) return '';
  return (process.env as any)[envVar] || '';
}

// ── Model color helpers ──────────────────────────────────────────
export function getProviderInfo(model: string): { color: string; name: string; badge: string } {
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

export function getModelColor(model: string): string {
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('llama') || model.startsWith('mixtral') || model.startsWith('gemma')) return 'groq';
  if (model.startsWith('gemini')) return 'google';
  if (model.startsWith('kserve-') || model === 'kserve') return 'kserve';
  if (model.includes('/')) return 'openrouter';
  return 'custom';
}
export function getModelBadgeClass(model: string): string { return `badge-${getModelColor(model)}`; }
export function getPanelBorderClass(model: string): string { return `panel-${getModelColor(model)}`; }

// ── localStorage helpers ─────────────────────────────────────────
export function loadRecentQueries(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_QUERIES) || '[]'); } catch { return []; }
}
export function saveRecentQuery(query: string) {
  if (typeof window === 'undefined') return;
  const existing = loadRecentQueries();
  const updated = [query, ...existing.filter(q => q !== query)].slice(0, 10);
  localStorage.setItem(STORAGE_KEY_QUERIES, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('evalify-query-saved', { detail: updated }));
}
export function loadConfigs(): SavedConfig[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CONFIGS) || '[]'); } catch { return []; }
}
export function saveConfigs(configs: SavedConfig[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CONFIGS, JSON.stringify(configs));
}
export function loadJudgeHistory(): JudgeResult[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('evalify-judge-history') || '[]'); } catch { return []; }
}
export function saveJudgeResult(result: JudgeResult) {
  if (typeof window === 'undefined') return;
  const existing = loadJudgeHistory();
  const updated = [result, ...existing].slice(0, 50);
  localStorage.setItem('evalify-judge-history', JSON.stringify(updated));
}
export function avg(nums: (number | null | undefined)[]): number | null {
  const valid = nums.filter((n): n is number => n != null && !isNaN(n));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ── Status Dot ────────────────────────────────────────────────
export function StatusDot({ status }: { status: ModelStatus }) {
  const color = status === 'online' ? '#4ade80' : status === 'error' ? '#f87171' : '#d1d5db';
  return <span style={{ backgroundColor: color, width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} title={status} />;
}

// ── Add to Pool Button ────────────────────────────────────────
export function AddToPoolButton({ entry, pool, onAdd, onRemove }: {
  entry: Omit<PoolEntry, 'id'>;
  pool: PoolEntry[];
  onAdd: (e: PoolEntry) => void;
  onRemove: (id: string) => void;
}) {
  const norm = (s: string) => (s ?? '').trim().toLowerCase();

  const existing = pool.find(p => p.label === entry.label && norm(p.prompt) === norm(entry.prompt));
  if (existing) {
    return (
      <button onClick={() => onRemove(existing.id)} className="text-[10px] px-2 py-0.5 rounded-lg" style={{background:"rgba(245,158,11,0.15)",border:"1px solid rgba(245,158,11,0.3)",color:"#f59e0b"}}>
        ✓ In Judge Pool
      </button>
    );
  }

  const lockedPrompt = pool.length > 0 ? pool[0].prompt : null;
  const isLocked = !!lockedPrompt && norm(lockedPrompt) !== norm(entry.prompt);

  if (isLocked) {
    return (
      <button disabled title={`Pool locked to: "${lockedPrompt}"`}
        className="text-[10px] px-2 py-0.5 rounded"
        style={{opacity:0.35, cursor:'not-allowed', background:'rgba(100,100,100,0.1)', border:'1px solid rgba(100,100,100,0.2)', color:'var(--text-muted)'}}>
        🔒 Diff. question
      </button>
    );
  }

  return (
    <button
      onClick={() => onAdd({ ...entry, id: `${Date.now()}-${Math.random()}` })}
      className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-700 transition-colors">
      ➕ Add to Judge
    </button>
  );
}


// ── Save Config Modal ─────────────────────────────────────────
export function SaveConfigModal({ config, onSave, onClose }: {
  config: Omit<SavedConfig, 'id' | 'name' | 'createdAt'>;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="font-display font-bold text-base mb-4" style={{color:"var(--text-primary)"}}>💾 Save Config</h3>
        <div className="space-y-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My LLM Server, Code Assist..." autoFocus
            className="input-dark w-full px-3 py-2 text-sm"
            onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(name.trim())} />
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2 space-y-0.5">
            <div>URL: <span className="text-gray-600">{config.endpointUrl || '—'}</span></div>
            <div>Model: <span className="text-gray-600">{config.endpointModel || '—'}</span></div>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost flex-1 px-3 py-2 text-sm">Cancel</button>
            <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} className="btn-primary flex-1 px-3 py-2 text-sm">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ── Reusable helpers ──────────────────────────────────────────
export function KeyValueEditor({ label, pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value' }: {
  label: string; pairs: KeyValuePair[]; onChange: (p: KeyValuePair[]) => void;
  keyPlaceholder?: string; valuePlaceholder?: string;
}) {
  const add = () => onChange([...pairs, { key: '', value: '' }]);
  const remove = (i: number) => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i: number, f: 'key' | 'value', v: string) => onChange(pairs.map((p, idx) => idx === i ? { ...p, [f]: v } : p));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</label>
        <button onClick={add} className="text-[10px] px-2 py-0.5 rounded border border-blue-200 text-blue-500 hover:bg-blue-50">+ Add</button>
      </div>
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-1 mb-1">
          <input value={p.key} onChange={e => update(i, 'key', e.target.value)} placeholder={keyPlaceholder} className="input-dark flex-1 px-2 py-1.5 text-xs" />
          <input value={p.value} onChange={e => update(i, 'value', e.target.value)} placeholder={valuePlaceholder} className="input-dark flex-1 px-2 py-1.5 text-xs" />
          <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600 px-1 text-xs">✕</button>
        </div>
      ))}
    </div>
  );
}

export function PromptEditor({ complexity, customPrompt, isCustomPrompt, onCustomPromptChange, onIsCustomChange }: {
  complexity: number; customPrompt: string; isCustomPrompt: boolean;
  onCustomPromptChange: (v: string) => void; onIsCustomChange: (v: boolean) => void;
}) {
  const defaultPrompt = `You are a helpful explainer bot.\n${COMPLEXITY_MAP[complexity]}\nAlways be concise and engaging.`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">System Prompt</span>
        <div className="flex gap-1">
          <button onClick={() => { if (!isCustomPrompt) onCustomPromptChange(defaultPrompt); onIsCustomChange(true); }} className="text-[10px] px-2 py-0.5 rounded border border-purple-300 text-purple-600 hover:bg-purple-50">Apply</button>
          <button onClick={() => { onCustomPromptChange(''); onIsCustomChange(false); }} className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500">Reset</button>
        </div>
      </div>
      <select onChange={e => { if (e.target.value === 'custom') { onCustomPromptChange(''); onIsCustomChange(true); } else if (e.target.value !== '') { onCustomPromptChange(e.target.value); onIsCustomChange(true); } e.target.value = ''; }} className="select-dark w-full p-1.5 text-xs">
        {PROMPT_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
      </select>
      <textarea value={isCustomPrompt ? customPrompt : defaultPrompt} onChange={e => { onCustomPromptChange(e.target.value); onIsCustomChange(true); }} rows={4} className="input-dark w-full p-2 text-xs font-mono resize-none" />
    </div>
  );
}


// ── Team Endpoint Picker ──────────────────────────────────────
export function TeamEndpointPicker({ type, onLoad }: {
  type: 'custom' | 'kserve';
  onLoad: (cfg: any) => void;
}) {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch('/api/endpoints')
      .then(r => r.json())
      .then(data => {
        setEndpoints(type === 'custom' ? data.customEndpoints : data.kserveEndpoints);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [type]);

  if (loading) return null;
  if (!endpoints || endpoints.length === 0) return null;

  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-widest block mb-1" style={{color:"var(--text-muted)"}}>
        🏢 Team Endpoints
      </label>
      <select
        defaultValue=""
        onChange={e => {
          if (!e.target.value) return;
          const cfg = endpoints.find(ep => ep.name === e.target.value);
          if (cfg) onLoad(cfg);
          e.target.value = '';
        }}
        className="w-full border rounded-lg p-1.5 text-xs bg-white border-blue-200"
      >
        <option value="">Load a team endpoint...</option>
        {endpoints.map(ep => (
          <option key={ep.name} value={ep.name}>
            {ep.name} {ep.description ? `— ${ep.description}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Tab Guide Component ──────────────────────────────────────
// Reusable how-to guide for all tabs
// Usage: <TabGuide id="compare" title="How to Compare Models" steps={[...]} />

interface GuideStep {
  icon: string;
  title: string;
  desc: string;
  color: string;
}

interface TabGuideProps {
  id: string;           // unique key for localStorage
  title: string;
  steps: GuideStep[];
  tip?: string;
}

export function TabGuide({ id, title, steps, tip }: TabGuideProps) {
  const storageKey = `evalify-guide-${id}-seen`;
  // Default false to avoid SSR/client mismatch (localStorage unavailable on server)
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(storageKey) !== 'true');
    } catch {
      setShow(true);
    }
  }, [storageKey]);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(storageKey, 'true'); } catch {}
  };

  if (!show) return (
    <div className="flex justify-end mb-3">
      <button onClick={() => setShow(true)} className="text-[10px] px-2 py-1 rounded border"
        style={{color:"var(--text-muted)",borderColor:"var(--border)"}}>
        ? How to use
      </button>
    </div>
  );

  return (
    <div className="mb-5 rounded-2xl overflow-hidden" style={{border:"1px solid rgba(99,102,241,0.3)",background:"rgba(99,102,241,0.04)"}}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{borderBottom:"1px solid rgba(99,102,241,0.15)",background:"rgba(99,102,241,0.08)"}}>
        <span className="text-sm font-semibold font-display" style={{color:"var(--accent)"}}>✨ {title}</span>
        <button onClick={dismiss} className="text-[11px] px-2 py-0.5 rounded" style={{color:"var(--text-muted)"}}>✕ Got it</button>
      </div>
      <div className={`grid gap-px`} style={{gridTemplateColumns:`repeat(${steps.length},1fr)`,background:"rgba(99,102,241,0.1)"}}>
        {steps.map(s => (
          <div key={s.title} className="px-4 py-4" style={{background:"var(--bg-card)"}}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{background:`${s.color}22`,color:s.color,border:`1px solid ${s.color}44`}}>
                {steps.indexOf(s) + 1}
              </div>
              <span className="text-base">{s.icon}</span>
              <span className="text-xs font-semibold font-display" style={{color:"var(--text-primary)"}}>{s.title}</span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{color:"var(--text-muted)"}}>{s.desc}</p>
          </div>
        ))}
      </div>
      {tip && (
        <div className="px-4 py-2 flex items-center justify-between"
          style={{borderTop:"1px solid rgba(99,102,241,0.15)"}}>
          <span className="text-[10px]" style={{color:"var(--text-muted)"}}>💡 {tip}</span>
          <button onClick={dismiss} className="text-[11px] px-3 py-1 rounded-lg font-medium"
            style={{background:"rgba(99,102,241,0.15)",color:"var(--accent)",border:"1px solid rgba(99,102,241,0.3)"}}>
            Got it, let's go! →
          </button>
        </div>
      )}
    </div>
  );
}
