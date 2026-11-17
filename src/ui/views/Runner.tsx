import { useEffect, useRef, useState } from 'react';
import { API_URL, evalStatus, getRun, getScenarios, startEval } from '../api';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { Notice, Panel } from '../components/ui';

interface Status { status: string; done: number; total: number; runId?: string; error?: string }

/** Operator-only. The token lives in component memory and is never stored. */
export default function Runner() {
  const { replaceRun } = useRun();
  const [token, setToken] = useState('');
  const [scenarios, setScenarios] = useState<{ id: string; title: string }[]>([]);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [trials, setTrials] = useState(1);
  const [judge, setJudge] = useState(false);
  const [job, setJob] = useState<{ id: string; total: number } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => { if (API_URL) getScenarios().then((r) => setScenarios(r.scenarios)).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(() => () => window.clearInterval(timer.current), []);

  if (!API_URL) return <Notice tone="warn" title="The runner needs a backend">This deployment has no backend URL, so evaluations cannot be started here. Run <code>npm run eval:llm</code> locally; see the README.</Notice>;

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const running = status?.status === 'running' || (job !== null && status === null);
  const start = async () => {
    setErr(''); setStatus(null); setLoaded(false);
    try {
      const r = await startEval(token, { scenarioIds: picked.size ? [...picked] : undefined, trials, judge });
      setJob({ id: r.jobId, total: r.total });
      timer.current = window.setInterval(async () => {
        try {
          const s = await evalStatus(token, r.jobId); setStatus(s);
          if (s.status !== 'running') {
            window.clearInterval(timer.current);
            if (s.runId) { replaceRun(await getRun(token, s.runId)); setLoaded(true); }
          }
        } catch (e) { window.clearInterval(timer.current); setErr((e as Error).message); }
      }, 2000);
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="stack-lg">
      <Panel>
        <Panel.Head title="Configure a run" aside="Spends model budget on the server; capped per run" />
        <Panel.Body>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void start(); }}>
            <div className="cluster">
              <label className="field">Operator token
                <input name="token" className="input" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <label className="field">Trials per scenario
                <select value={trials} onChange={(e) => setTrials(Number(e.target.value))}>{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select>
              </label>
              <label className="check"><input type="checkbox" checked={judge} onChange={(e) => setJudge(e.target.checked)} />Also run the LLM judge (scored separately)</label>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small muted" style={{ padding: 0, marginBottom: 6 }}>Scenarios · {picked.size ? `${picked.size} selected` : 'none selected means the full suite'}</legend>
              <div className="cluster" style={{ maxHeight: 200, overflow: 'auto' }}>
                {scenarios.map((s) => <label key={s.id} className="check" style={{ minWidth: 220 }}><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />{s.id}</label>)}
              </div>
            </fieldset>
            <div className="cluster">
              <button className="btn" type="submit" disabled={!token || running}>{running ? 'Running…' : picked.size ? 'Run selected scenarios' : 'Run full suite'}</button>
              <button className="btn secondary" type="button" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear selection</button>
            </div>
          </form>
        </Panel.Body>
      </Panel>

      {job ? (
        <Panel>
          <Panel.Head title="Progress" />
          <Panel.Body>
            <div className="cluster" role="status" aria-live="polite">
              <span>{status ? `${status.status}: ${status.done} of ${status.total} conversations` : `Started: ${job.total} conversations…`}</span>
              {status ? <progress value={status.done} max={status.total} aria-label="Evaluation progress" /> : null}
            </div>
            {status?.error ? <p style={{ color: 'var(--fail)' }}>{status.error}</p> : null}
            {loaded ? <p style={{ marginTop: 8 }}>Finished. The results now on <a href={href({ section: 'overview' })}>Results</a> and <a href={href({ section: 'scenarios' })}>Scenarios</a> come from this run.</p> : null}
          </Panel.Body>
        </Panel>
      ) : null}
      {err ? <Notice tone="bad" title="Request failed">{err}</Notice> : null}
    </div>
  );
}
