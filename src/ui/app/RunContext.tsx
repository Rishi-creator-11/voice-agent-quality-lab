import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { summarizeRun } from '../../llm/metrics';
import type { EvalRun } from '../../llm/types';

type Summary = ReturnType<typeof summarizeRun>;
/** The provider owns loading and derivation; views only read (state / actions interface). */
interface RunValue {
  status: 'loading' | 'ready' | 'missing'; error: string; run: EvalRun | null; summary: Summary | null; replaceRun: (r: EvalRun) => void;
}
const Ctx = createContext<RunValue | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<EvalRun | null>(null);
  const [status, setStatus] = useState<RunValue['status']>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    const ctl = new AbortController();
    fetch('./llm-results.json', { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<EvalRun>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { setRun(j); setStatus('ready'); })
      .catch((e: Error) => { if (e.name !== 'AbortError') { setError(e.message); setStatus('missing'); } });
    return () => ctl.abort();
  }, []);
  const summary = useMemo(() => (run ? summarizeRun(run) : null), [run]);
  const value = useMemo<RunValue>(
    () => ({ status, error, run, summary, replaceRun: (r) => { setRun(r); setStatus('ready'); } }),
    [status, error, run, summary],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRun(): RunValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRun must be used inside RunProvider');
  return v;
}
