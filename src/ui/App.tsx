import { useEffect, useState } from 'react';
import type { EvalRun } from '../llm/types';
import { AgentsView, Compare, Explorer, Overview } from './LlmViews';
import { Playground } from './Playground';
import { Runner } from './Runner';
import { SimApp } from './SimApp';

type Top = 'llm' | 'sim';
type Tab = 'overview' | 'compare' | 'scenarios' | 'playground' | 'runner' | 'agents';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['compare', 'A vs B'], ['scenarios', 'Scenario explorer'], ['playground', 'Live agent'], ['runner', 'Run evaluation'], ['agents', 'Agents & method']];

export function App() {
  const [top, setTop] = useState<Top>('llm');
  const [tab, setTab] = useState<Tab>('overview');
  const [run, setRun] = useState<EvalRun | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    fetch('./llm-results.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: EvalRun) => setRun(j)).catch((e: Error) => setLoadErr(e.message)).finally(() => setLoaded(true));
  }, []);
  const open = (id: string) => { setFocus(id); setTab('scenarios'); };
  const needsRun = ['overview', 'compare', 'scenarios', 'agents'].includes(tab);

  return (
    <main>
      <h1>Voice Agent Quality Lab</h1>
      <p>Build, test and compare LLM appointment-booking agents on a fictional dental clinic: real model, real tool calls against a real (synthetic) database, deterministic checks on the outcome.</p>
      <div className="banner" role="note">
        Independent portfolio project. Not affiliated with, built on, or approved by Regal. Synthetic data only. Text and browser voice; no phone calls.
      </div>
      <nav role="tablist" aria-label="Section">
        <button role="tab" aria-selected={top === 'llm'} onClick={() => setTop('llm')}>LLM evaluation</button>
        <button role="tab" aria-selected={top === 'sim'} onClick={() => setTop('sim')}>Historical simulator (v1)</button>
      </nav>
      {top === 'sim' ? <SimApp /> : (
        <>
          <nav role="tablist" aria-label="LLM evaluation views">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          </nav>
          {needsRun && !run && (
            <div className="banner" role="status">
              {!loaded ? 'Loading recorded results…' : <>No recorded LLM evaluation is available in this deployment{loadErr && ` (${loadErr})`}. Nothing is shown rather than placeholder numbers.</>}
            </div>
          )}
          {tab === 'overview' && run && <Overview run={run} />}
          {tab === 'compare' && run && <Compare run={run} open={open} />}
          {tab === 'scenarios' && run && <Explorer run={run} focus={focus} setFocus={setFocus} />}
          {tab === 'agents' && run && <AgentsView run={run} />}
          {tab === 'playground' && <Playground />}
          {tab === 'runner' && <Runner onLoaded={(r) => { setRun(r); setTab('overview'); }} />}
        </>
      )}
    </main>
  );
}
