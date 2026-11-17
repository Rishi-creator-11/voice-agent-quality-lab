import { useEffect, useRef, useState } from 'react';
import { API_URL, evalStatus, getRun, getScenarios, startEval } from './api';
import type { EvalRun } from '../llm/types';

/** Operator-only: runs real evaluations on the backend. The token lives in component memory only (never stored). */
export function Runner({ onLoaded }: { onLoaded: (run: EvalRun) => void }) {
  const [token, setToken] = useState('');
  const [scenarios, setScenarios] = useState<{ id: string; title: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [trials, setTrials] = useState(1);
  const [judge, setJudge] = useState(false);
  const [job, setJob] = useState<{ id: string; total: number } | null>(null);
  const [status, setStatus] = useState<{ status: string; done: number; total: number; runId?: string; error?: string } | null>(null);
  const [err, setErr] = useState('');
  const timer = useRef<number | undefined>();

  useEffect(() => { if (API_URL) getScenarios().then((r) => setScenarios(r.scenarios)).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => () => window.clearInterval(timer.current), []);

  if (!API_URL) return <div className="banner" role="status"><strong>Runner needs a backend.</strong> This deployment has no backend URL, so evaluations cannot be started here. Run <code>npm run eval:llm</code> locally; see the README.</div>;

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const start = async () => {
    setErr(''); setStatus(null);
    try {
      const r = await startEval(token, { scenarioIds: picked.size ? [...picked] : undefined, trials, judge });
      setJob({ id: r.jobId, total: r.total });
      timer.current = window.setInterval(async () => {
        try {
          const s = await evalStatus(token, r.jobId); setStatus(s);
          if (s.status !== 'running') {
            window.clearInterval(timer.current);
            if (s.runId) onLoaded(await getRun(token, s.runId));
          }
        } catch (e) { window.clearInterval(timer.current); setErr((e as Error).message); }
      }, 2000);
    } catch (e) { setErr((e as Error).message); }
  };
  const running = status?.status === 'running' || (!!job && !status);

  return (
    <>
      <p className="small">Starts a real evaluation on the server using its model key and budget cap. Requires the operator token. Each selected scenario runs on both agents from a clean database. When it finishes, the results load into the other tabs.</p>
      <div className="row">
        <label>Operator token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" style={{ padding: 8 }} /></label>
        <label>Trials <select value={trials} onChange={(e) => setTrials(Number(e.target.value))}>{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="small"><input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} /> Run LLM judge (separate scores)</label>
      </div>
      <h3>Scenarios ({picked.size ? `${picked.size} selected` : 'none selected = all'})</h3>
      <div className="row small" style={{ maxHeight: 180, overflow: 'auto' }}>
        {scenarios.map((s) => <label key={s.id} style={{ minWidth: 220 }}><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} /> {s.id}</label>)}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={!token || running} onClick={start}>{running ? 'Running…' : picked.size ? 'Run selected' : 'Run full suite'}</button>
        <button className="btn sec" onClick={() => setPicked(new Set())}>Clear selection</button>
      </div>
      {job && <p className="small" role="status">
        {status ? `${status.status}: ${status.done}/${status.total} conversations` : `Started (${job.total} conversations)…`}
        {status && <progress value={status.done} max={status.total} style={{ marginLeft: 8 }} />}
        {status?.error && <strong> · {status.error}</strong>}
      </p>}
      {err && <p className="small" style={{ color: 'var(--bad)' }}>{err}</p>}
    </>
  );
}
