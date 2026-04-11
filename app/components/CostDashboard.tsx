'use client';

import { useState, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────────
interface ResponseEntry {
  id: string; timestamp: string; panel: string; question: string;
  model: string; level: string; responseTime: number | null;
  tokens: number | null; cost: number | null; score: 'up' | 'down' | null;
}

interface JudgeEntry {
  id: string; timestamp: string; prompt: string;
  judgeModel: string; criteria: string;
  responses: { label: string; model: string }[];
  winner: string; reasoning: string;
  scores: Record<string, Record<string, number>>;
}

// ── Provider helpers ─────────────────────────────────────────
const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f', anthropic: '#c96442', groq: '#f55036',
  google: '#4285f4', openrouter: '#7c3aed', custom: '#6366f1', kserve: '#ec4899',
};
const PROVIDER_NAMES: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', groq: 'Groq',
  google: 'Google', openrouter: 'OpenRouter', custom: 'Custom', kserve: 'KServe',
};

function getProvider(model: string): string {
  if (!model) return 'custom';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('llama') || model.startsWith('mixtral')) return 'groq';
  if (model.startsWith('gemini') || model.startsWith('google/')) return 'google';
  if (model.startsWith('kserve')) return 'kserve';
  if (model.includes('/')) return 'openrouter';
  return 'custom';
}

function shortName(model: string): string {
  if (!model) return '—';
  if (model.includes('/')) return model.split('/')[1].replace('deepseek-', 'DS-');
  const parts = model.split('-');
  if (parts[0] === 'claude') return `${parts[0]}-${parts[1]}`;
  if (parts[0] === 'gemini') return `${parts[0]}-${parts[1]}`;
  if (parts[0] === 'llama')  return `${parts[0]}-${parts[1]}`;
  if (parts[0] === 'gpt')    return `${parts[0]}-${parts[1]}`;
  return parts.slice(0, 2).join('-');
}

function fmt$(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.0001) return '$' + n.toFixed(6);
  if (n < 0.01)   return '$' + n.toFixed(5);
  if (n < 1)      return '$' + n.toFixed(4);
  return '$' + n.toFixed(2);
}

function fmtK(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.round(n).toString();
}

// ── Main Component ────────────────────────────────────────────
export function CostDashboard() {
  const [responses, setResponses] = useState<ResponseEntry[]>([]);
  const [judgeHistory, setJudgeHistory] = useState<JudgeEntry[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = () => {
    try {
      const r = JSON.parse(localStorage.getItem('evalify-response-history') || '[]');
      const j = JSON.parse(localStorage.getItem('evalify-judge-history') || '[]');
      setResponses(r);
      setJudgeHistory(j);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {}
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Computed stats ──────────────────────────────────────────
  const totalCost    = responses.reduce((s, r) => s + (r.cost || 0), 0);
  const totalTokens  = responses.reduce((s, r) => s + (r.tokens || 0), 0);
  const avgTime      = responses.length ? responses.reduce((s, r) => s + (r.responseTime || 0), 0) / responses.length : 0;
  const rated        = responses.filter(r => r.score);
  const thumbsUp     = rated.filter(r => r.score === 'up').length;
  const approvalRate = rated.length ? Math.round(thumbsUp / rated.length * 100) : null;

  // Provider breakdown
  const byCost: Record<string, number> = {};
  const byTokens: Record<string, number> = {};
  responses.forEach(r => {
    const p = getProvider(r.model);
    byCost[p]   = (byCost[p]   || 0) + (r.cost   || 0);
    byTokens[p] = (byTokens[p] || 0) + (r.tokens || 0);
  });

  // Model breakdown
  const byModel: Record<string, { cost: number; tokens: number; time: number; count: number }> = {};
  responses.forEach(r => {
    const k = r.model || 'unknown';
    if (!byModel[k]) byModel[k] = { cost: 0, tokens: 0, time: 0, count: 0 };
    byModel[k].cost   += r.cost   || 0;
    byModel[k].tokens += r.tokens || 0;
    byModel[k].time   += r.responseTime || 0;
    byModel[k].count  += 1;
  });

  const maxCost  = Math.max(...Object.values(byCost), 0.000001);
  const maxModel = Math.max(...Object.values(byModel).map(m => m.cost), 0.000001);

  if (responses.length === 0 && judgeHistory.length === 0) {
    return (
      <div className="glass-dark rounded-2xl p-12 text-center">
        <div className="text-5xl mb-4" style={{opacity:0.4}}>💰</div>
        <div className="font-display font-semibold text-lg mb-2" style={{color:"var(--text-primary)"}}>No cost data yet</div>
        <div className="text-sm mb-1" style={{color:"var(--text-muted)"}}>Ask questions in Compare Models to track API costs</div>
        <div className="text-xs mt-4" style={{color:"var(--text-muted)"}}>Auto-refreshes every 10 seconds</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-2xl" style={{color:"#10b981"}}>💰 Cost Dashboard</h2>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-[10px]" style={{color:"var(--text-muted)"}}>Updated {lastUpdated}</span>}
          <button onClick={loadData} className="btn-ghost text-xs px-3 py-1.5"
            style={{borderColor:"rgba(16,185,129,0.3)",color:"#10b981"}}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: 'Total cost', value: fmt$(totalCost), sub: `${responses.length} API calls`, color: '#10b981' },
          { label: 'Tokens used', value: fmtK(totalTokens), sub: `avg ${responses.length ? Math.round(totalTokens / responses.length) : 0} / query`, color: '#6366f1' },
          { label: 'Avg response', value: Math.round(avgTime) + 'ms', sub: 'across all models', color: '#f59e0b' },
          { label: 'Approval rate', value: approvalRate !== null ? approvalRate + '%' : '—', sub: `${rated.length} rated`, color: approvalRate !== null && approvalRate > 70 ? '#10b981' : '#9090bb' },
        ].map(c => (
          <div key={c.label} className="glass-dark rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{color:"var(--text-muted)"}}>{c.label}</div>
            <div className="text-2xl font-bold font-display" style={{color:c.color}}>{c.value}</div>
            <div className="text-[11px] mt-1" style={{color:"var(--text-muted)"}}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Provider + Model bars */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Cost by provider */}
        <div className="glass-dark rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest mb-4" style={{color:"var(--text-muted)"}}>Cost by provider</div>
          {Object.entries(byCost).sort((a,b) => b[1]-a[1]).map(([p, cost]) => (
            <div key={p} className="flex items-center gap-2 mb-3 text-xs">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:PROVIDER_COLORS[p]||'#666'}}/>
              <div style={{width:90,color:"var(--text-primary)",flexShrink:0}}>{PROVIDER_NAMES[p]||p}</div>
              <div className="flex-1 rounded" style={{background:"rgba(255,255,255,0.06)",height:6,overflow:'hidden'}}>
                <div className="h-full rounded" style={{width:`${Math.round(cost/maxCost*100)}%`,background:PROVIDER_COLORS[p]||'#666'}}/>
              </div>
              <div style={{width:56,textAlign:'right',color:"var(--text-muted)",fontVariantNumeric:'tabular-nums'}}>{fmt$(cost)}</div>
              <div style={{width:44,textAlign:'right',color:"var(--text-muted)",fontSize:10}}>{fmtK(byTokens[p]||0)} tok</div>
            </div>
          ))}
        </div>

        {/* Cost by model */}
        <div className="glass-dark rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-widest mb-4" style={{color:"var(--text-muted)"}}>Cost by model</div>
          {Object.entries(byModel).sort((a,b) => b[1].cost-a[1].cost).map(([model, stats]) => {
            const p = getProvider(model);
            return (
              <div key={model} className="flex items-center gap-2 mb-3 text-xs">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:PROVIDER_COLORS[p]||'#666'}}/>
                <div style={{width:90,color:"var(--text-primary)",flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{shortName(model)}</div>
                <div className="flex-1 rounded" style={{background:"rgba(255,255,255,0.06)",height:6,overflow:'hidden'}}>
                  <div className="h-full rounded" style={{width:`${Math.round(stats.cost/maxModel*100)}%`,background:PROVIDER_COLORS[p]||'#666'}}/>
                </div>
                <div style={{width:56,textAlign:'right',color:"var(--text-muted)",fontVariantNumeric:'tabular-nums'}}>{fmt$(stats.cost)}</div>
                <div style={{width:44,textAlign:'right',color:"var(--text-muted)",fontSize:10}}>{stats.count}x</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Response log */}
      <div className="glass-dark rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-widest" style={{color:"var(--text-muted)"}}>Response log</div>
          <div className="text-[10px]" style={{color:"var(--text-muted)"}}>{responses.length} entries</div>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                {['Time','Panel','Model','Question','Level','ms','Tokens','Cost','Score'].map(h => (
                  <th key={h} style={{padding:'4px 8px',textAlign:h==='ms'||h==='Tokens'||h==='Cost'?'right':'left',color:'var(--text-muted)',fontWeight:500,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...responses].reverse().slice(0, 50).map(r => {
                const p = getProvider(r.model);
                const col = PROVIDER_COLORS[p] || '#666';
                return (
                  <tr key={r.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <td style={{padding:'5px 8px',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{r.timestamp||'—'}</td>
                    <td style={{padding:'5px 8px'}}>{r.panel||'—'}</td>
                    <td style={{padding:'5px 8px'}}>
                      <span style={{background:`${col}22`,color:col,fontSize:10,padding:'2px 6px',borderRadius:4,whiteSpace:'nowrap'}}>{shortName(r.model)}</span>
                    </td>
                    <td style={{padding:'5px 8px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-muted)'}}>{r.question||'—'}</td>
                    <td style={{padding:'5px 8px',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{r.level||'—'}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',color:'var(--text-muted)'}}>{r.responseTime ? Math.round(r.responseTime) : '—'}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',color:'var(--text-muted)'}}>{r.tokens||'—'}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',color:'#10b981',fontVariantNumeric:'tabular-nums'}}>{fmt$(r.cost)}</td>
                    <td style={{padding:'5px 8px',textAlign:'right'}}>{r.score==='up'?'👍':r.score==='down'?'👎':'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Judge history */}
      {judgeHistory.length > 0 && (
        <div className="glass-dark rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-widest" style={{color:"var(--text-muted)"}}>Judge history</div>
            <div className="text-[10px]" style={{color:"var(--text-muted)"}}>{judgeHistory.length} runs</div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                {['Judge model','Prompt','Winner','Models compared','Criteria'].map(h => (
                  <th key={h} style={{padding:'4px 8px',textAlign:'left',color:'var(--text-muted)',fontWeight:500}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {judgeHistory.slice(0, 20).map(j => (
                <tr key={j.id} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <td style={{padding:'5px 8px'}}>
                    <span style={{background:'rgba(245,158,11,0.15)',color:'#f59e0b',fontSize:10,padding:'2px 6px',borderRadius:4}}>{shortName(j.judgeModel)}</span>
                  </td>
                  <td style={{padding:'5px 8px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-muted)'}}>{j.prompt||'—'}</td>
                  <td style={{padding:'5px 8px',color:'#f59e0b',fontWeight:500}}>{j.winner||'—'}</td>
                  <td style={{padding:'5px 8px',color:'var(--text-muted)'}}>{(j.responses||[]).map(r=>shortName(r.model)).join(', ')}</td>
                  <td style={{padding:'5px 8px',color:'var(--text-muted)',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{j.criteria ? j.criteria.slice(0,40)+'...' : 'MT-Bench default'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
