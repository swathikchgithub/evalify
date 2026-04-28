'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { ModelStatus, HistoryEntry, PoolEntry, ActiveTab } from '../types/evalify-types';
import { STORAGE_KEY_CONFIGS, MAX_RECENT_QUERIES, DEFAULT_PANEL_MODELS } from '../config/evalify-constants';
import { AddToPoolButton, saveRecentQuery, loadJudgeHistory, TabGuide } from './components/shared';
import { ChatPanel }           from './components/ChatPanel';
import { StatsPanel }          from './components/StatsPanel';
import { CostDashboard }       from './components/CostDashboard';
import { JudgeTab }            from './components/JudgeTab';
import { QueryInput }          from './components/QueryInput';
import TokenizerTab from './components/TokenizerTab';

export default function Home() {
  const [activeTab, setActiveTab]               = useState<ActiveTab>('compare');
  const [input, setInput]                       = useState('');
  const [submitTrigger, setSubmitTrigger]       = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load persisted response history after mount (SSR-safe)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('evalify-response-history') || '[]');
      if (saved.length > 0) setHistory(saved);
    } catch {}
  }, []);
  const [modelStatuses, setModelStatuses]       = useState<Record<string, ModelStatus>>({});
  const [pool, setPool]                         = useState<PoolEntry[]>([]);
  const [clearAllTrigger, setClearAllTrigger]   = useState(0);
  const clearFnsRef   = useRef<Record<string, () => void>>({});
  const registerClear = useCallback((id: string, fn: () => void) => { clearFnsRef.current[id] = fn; }, []);
  const lastInput     = useRef('');
  const [panelModels, setPanelModels] = useState<Record<string, string>>({ ...DEFAULT_PANEL_MODELS });
  const onModelChange = useCallback((panelId: string, model: string) => {
    setPanelModels(prev => ({ ...prev, [panelId]: model }));
  }, []);
  const [activePanels, setActivePanels] = useState<Record<string, boolean>>({
    A: true, B: true, C: true, D: true,
  });
  const togglePanel = (id: string) =>
    setActivePanels(prev => ({ ...prev, [id]: !prev[id] }));

  const onMetric = (e: HistoryEntry) => setHistory(prev => {
    const updated = [...prev, e];
    try { localStorage.setItem('evalify-response-history', JSON.stringify(updated.slice(-200))); } catch {}
    return updated;
  });
  const onScore = (id: string, s: 'up' | 'down') => setHistory(prev => {
    const updated = prev.map(h => h.id === id ? { ...h, score: s } : h);
    try { localStorage.setItem('evalify-response-history', JSON.stringify(updated)); } catch {}
    return updated;
  });
  const onModelStatus    = (model: string, status: ModelStatus) => setModelStatuses(prev => ({ ...prev, [model]: status }));
  const onAddToPool      = useCallback((e: PoolEntry) => setPool(prev => [...prev, e]), []);
  const onRemoveFromPool = useCallback((id: string) => setPool(prev => prev.filter(p => p.id !== id)), []);

  const handleSubmit = () => {
    if (!input.trim()) return;
    saveRecentQuery(input.trim());
    lastInput.current = input;
    setSubmitTrigger(t => t + 1);
    setInput('');
  };

  const exportCSV = () => {
    const headers = ['Time','Panel','Question','Model','Level','Response Time (ms)','Tokens','Cost ($)','Score'];
    const rows = history.map(h => [
      h.timestamp, h.panel,
      `"${(h.question ?? '').replace(/"/g, '""')}"`,
      h.model, h.level,
      h.responseTime ?? '', h.tokens ?? '',
      h.cost != null ? h.cost.toFixed(5) : '',
      h.score ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `evalify-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="max-w-[1600px] mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6" style={{minHeight:"100vh"}}>
      <div className="fixed inset-0 header-grid opacity-30 pointer-events-none" style={{zIndex:0}} />
      <div className="relative" style={{zIndex:1}}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-4 sm:pb-6" style={{borderBottom:"1px solid var(--border)"}}>
          <div>
            <h1 className="font-display text-2xl sm:text-4xl font-bold gradient-text tracking-tight">⚡ Evalify</h1>
            <p className="text-sm mt-2 flex items-center gap-2" style={{color:'var(--text-muted)'}}>
              <span className="badge-openai   text-[10px] px-2 py-0.5 rounded-full">Compare LLMs</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:"rgba(245,158,11,0.1)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.2)"}}>⚖️ BYOJ Judge</span>
            </p>
          </div>
          {history.length > 0 && (
            <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm">⬇️ Export CSV</button>
          )}
        </div>

        {/* ── Judge pool bar ──────────────────────────────────── */}
        {pool.length > 0 && (
          <div className="pool-bar flex items-center gap-2 px-4 py-2">
            <span className="text-xs font-medium font-display" style={{color:"#f59e0b"}}>⚖️ Judge Pool:</span>
            <div className="flex gap-2 flex-wrap flex-1">
              {pool.map(p => (
                <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{background:"rgba(245,158,11,0.15)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.2)"}}>
                  {p.label}
                  <button onClick={() => onRemoveFromPool(p.id)} className="text-yellow-500 hover:text-yellow-800 ml-1">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setPool([])}
                className="text-xs px-2 py-1 rounded border whitespace-nowrap"
                style={{borderColor:"rgba(239,68,68,0.3)",color:"#ef4444"}}
                title="Clear all from pool">
                🗑 Clear Pool
              </button>
              {pool.length >= 2 && (
                <button onClick={() => setActiveTab('judge')} className="btn-judge text-xs px-3 py-1 whitespace-nowrap">
                  ⚖️ Run Judge
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────── */}
        <div className="flex gap-1 tab-bar overflow-x-auto" style={{padding:"4px 0", WebkitOverflowScrolling:"touch", scrollbarWidth:"none"}}>
          <button onClick={() => setActiveTab('compare')} className="tab"
            style={activeTab==='compare' ? {color:"#fff",borderBottomColor:"var(--accent)",fontWeight:700,background:"rgba(99,102,241,0.12)",borderRadius:"8px 8px 0 0",padding:"8px 16px"} : {}}>
            ⚡ Compare Models
          </button>
          <button onClick={() => setActiveTab('judge')} className="tab"
            style={activeTab==='judge' ? {color:"var(--judge)",borderBottomColor:"var(--judge)",fontWeight:700,background:"rgba(245,158,11,0.12)",borderRadius:"8px 8px 0 0",padding:"8px 16px"} : {}}>
            ⚖️ Judge {pool.length > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                style={{background:"rgba(245,158,11,0.15)",color:"var(--judge)"}}>{pool.length}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('costs')} className="tab"
            style={activeTab==='costs' ? {color:"#10b981",borderBottomColor:"#10b981",fontWeight:700,background:"rgba(16,185,129,0.12)",borderRadius:"8px 8px 0 0",padding:"8px 16px"} : {}}>
            💰 Costs
          </button>
          <button onClick={() => setActiveTab('stats')} className="tab"
            style={activeTab==='stats' ? {color:"var(--accent)",borderBottomColor:"var(--accent)",fontWeight:700,background:"rgba(99,102,241,0.12)",borderRadius:"8px 8px 0 0",padding:"8px 16px"} : {}}>
            📊 Stats {history.length > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                style={{background:"rgba(99,102,241,0.15)",color:"var(--accent)"}}>{history.length}</span>
            )}
          </button>
          <button onClick={() => setActiveTab('tokenizer')} className="tab"
            style={activeTab==='tokenizer' ? {color:"var(--tokenizer)",borderBottomColor:"var(--tokenizer)",fontWeight:700,background:"rgba(16,185,129,0.12)",borderRadius:"8px 8px 0 0",padding:"8px 16px"} : {}}>
            🔤 Tokenizer
          </button>
        </div>

        {/* ── Compare tab ────────────────────────────────────── */}
        <div style={{display: activeTab === 'compare' ? 'block' : 'none'}}>
          <TabGuide id="compare" title="How to Compare Models"
            steps={[
              { icon: "✏️", title: "Type a Question", desc: "Type any question in the input bar at the bottom of the page.", color: "#6366f1" },
              { icon: "⚡", title: "Ask All", desc: "Click Ask All to send to all 4 panels simultaneously and compare responses.", color: "#f97316" },
              { icon: "🎛️", title: "Tune Params", desc: "Adjust temperature, max tokens, and top-p independently per panel.", color: "#10b981" },
              { icon: "➕", title: "Add to Judge", desc: "Click ➕ Add to Judge on any response to evaluate them with AI.", color: "#f59e0b" },
            ]}
            tip="Switch Panel A to DeepSeek, Panel B to Claude — compare any models side by side."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {(['A','B','C','D'] as const).map(p => (
              <ChatPanel key={p} panelId={p}
                sharedInput={lastInput.current}
                submitTrigger={activePanels[p] ? submitTrigger : 0}
                onMetric={onMetric} onScore={onScore}
                pool={pool} onAddToPool={onAddToPool} onRemoveFromPool={onRemoveFromPool}
                modelStatuses={modelStatuses} onModelStatus={onModelStatus}
                clearTrigger={clearAllTrigger}
                onRegisterClear={registerClear}
                isActive={activePanels[p]}
                onModelChange={onModelChange} />
            ))}
          </div>
          {/* Panel selector */}
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <span className="text-[12px] font-semibold" style={{color:"#c0c0e0"}}>Send to:</span>
          {(['A','B','C','D'] as const).map(p => {
            const modelName = panelModels[p] ?? '';
            const shortName = modelName.includes('/')
              ? modelName.split('/')[1].replace('deepseek-', 'DS-').replace('-versatile','')
              : modelName.split('-').slice(0,2).join('-');
            const panelTok = history.filter(h => h.panel === p).reduce((s, h) => s + (h.tokens ?? 0), 0);
            return (
              <button key={p} type="button"
                onClick={() => togglePanel(p)}
                className="text-[11px] px-3 py-1 rounded-full border transition-all"
                style={{
                  background: activePanels[p] ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                  borderColor: activePanels[p] ? '#818cf8' : 'rgba(255,255,255,0.15)',
                  color: activePanels[p] ? '#c7d2fe' : '#8888aa',
                  opacity: activePanels[p] ? 1 : 0.6,
                }}>
                {activePanels[p] ? '✓' : '○'} {shortName}
                {panelTok > 0 && <span className="ml-1 font-mono opacity-60">{panelTok.toLocaleString()}t</span>}
              </button>
            );
          })}
          <button type="button"
            onClick={() => setActivePanels({ A:true, B:true, C:true, D:true })}
            className="text-[11px] px-3 py-1 rounded border font-medium"
            style={{color:"#a0a0c0", borderColor:"rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.06)"}}>
            All
          </button>
          <button type="button"
            onClick={() => setActivePanels({ A:false, B:false, C:false, D:false })}
            className="text-[11px] px-3 py-1 rounded border font-medium"
            style={{color:"#a0a0c0", borderColor:"rgba(255,255,255,0.2)", background:"rgba(255,255,255,0.06)"}}>
            None
          </button>
          {history.some(h => h.tokens) && (
            <span className="ml-auto text-[10px] font-mono" style={{color:"#6666aa"}}>
              ◈ {history.reduce((s, h) => s + (h.tokens ?? 0), 0).toLocaleString()} total tokens
            </span>
          )}
        </div>
        <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} className="flex flex-wrap gap-2 mt-2 items-center">
            <QueryInput value={input} onChange={setInput} onSubmit={handleSubmit}
              placeholder="Ask all four panels... (Enter to submit, 💡 for samples)" />
            <button type="submit" disabled={!input.trim()} className="btn-primary px-5 py-3 text-sm whitespace-nowrap">
              Ask All
            </button>
            <button type="button"
              onClick={() => {
                Object.values(clearFnsRef.current).forEach(fn => fn());
                setClearAllTrigger(t => t + 1);
              }}
              title="Clear all 4 panels"
              className="btn-ghost px-3 py-3 text-sm whitespace-nowrap"
              style={{borderColor:"rgba(239,68,68,0.2)",color:"#ef4444"}}>
              🗑 Clear
            </button>
          </form>
        </div>

        {/* ── Judge tab ───────────────────────────────────────── */}
        <div style={{display: activeTab === 'judge' ? 'block' : 'none'}}>
          <JudgeTab pool={pool} allHistory={history}
            onRemoveFromPool={onRemoveFromPool} onNavigate={setActiveTab} />
        </div>

        {/* ── Stats tab ───────────────────────────────────────── */}
        {activeTab === 'costs' && <div>
          <CostDashboard />
        </div>}
        
        {/* ── Tokenizer tab ──────────────────────────────────── */}
        <div style={{display: activeTab === 'tokenizer' ? 'block' : 'none'}}>
        <TokenizerTab />
        </div>

        {activeTab === 'stats' && <div>
          <div className="glass-dark rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display font-bold text-2xl gradient-text">📊 Evaluation History</h2>
              {history.length > 0 && (
                <button onClick={exportCSV} className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm"
                  style={{borderColor:"rgba(16,185,129,0.3)",color:"var(--openai)"}}>
                  ⬇️ Export CSV
                </button>
              )}
            </div>
            <StatsPanel history={history} onClearHistory={() => { setHistory([]); try { localStorage.removeItem('evalify-response-history'); } catch {} }} />
          </div>
        </div>}

      </div>
    </main>
  );
}
