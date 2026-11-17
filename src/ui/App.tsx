import { Fragment, useState } from 'react';
import { Agent } from '../core/agent';
import { CHANGE_NOTES, CONFIGS } from '../core/configs';
import { Sandbox } from '../core/tools';
import type { ToolCall } from '../core/types';
import { runBoth } from '../eval/runner';
import type { ScenarioResult } from '../eval/types';
import { prettyDate, prettyTime } from '../core/datetime';

type Tab = 'results' | 'scenarios' | 'try' | 'config';
const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
const Pill = ({ pass }: { pass: boolean }) => <span className={`pill ${pass ? 'pass' : 'fail'}`}>{pass ? 'PASS' : 'FAIL'}</span>;

export function App() {
  const [tab, setTab] = useState<Tab>('results');
  const [run, setRun] = useState(() => runBoth());
  const [runs, setRuns] = useState(1);
  const [focus, setFocus] = useState<string | null>(null);
  const open = (id: string) => { setFocus(id); setTab('scenarios'); };
  const tabs: [Tab, string][] = [['results', 'Results'], ['scenarios', 'Scenarios'], ['try', 'Try the agent'], ['config', 'A → B changes']];
  return (
    <main>
      <h1>Voice Agent Quality Lab</h1>
      <p>Automated QA for an appointment-booking voice agent: {run.A.length} scenarios run against two agent configurations, with every number below computed from those runs.</p>
      <div className="banner" role="note">
        <strong>What this is:</strong> a transcript-based simulation for a fictional dental clinic. The agents are deterministic rule-based programs, not an LLM and not a live phone call.
        Not affiliated with, built on, or approved by Regal; the Regal adapter is an unconnected draft.
      </div>
      <nav role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </nav>
      {tab === 'results' && <Results run={run} runs={runs} onRerun={() => { setRun(runBoth()); setRuns((n) => n + 1); }} open={open} />}
      {tab === 'scenarios' && <Scenarios run={run} focus={focus} setFocus={setFocus} />}
      {tab === 'try' && <Try />}
      {tab === 'config' && <Config />}
    </main>
  );
}

function Results({ run, runs, onRerun, open }: { run: ReturnType<typeof runBoth>; runs: number; onRerun: () => void; open: (id: string) => void }) {
  const a = run.metricsA, b = run.metricsB, c = run.comparison;
  const rows: [string, string, string, string][] = [
    ['Scenario pass rate', `${a.passed}/${a.scenarios} · ${pct(a.passRate)}`, `${b.passed}/${b.scenarios} · ${pct(b.passRate)}`, 'All checks of a scenario pass'],
    ['Conversation completion', `${a.goalReached}/${a.scenarios} · ${pct(a.completionRate)}`, `${b.goalReached}/${b.scenarios} · ${pct(b.completionRate)}`, 'Caller’s goal reached (outcome checks only)'],
    ['Tool-use correctness', `${a.toolChecksPassed}/${a.toolChecks}`, `${b.toolChecksPassed}/${b.toolChecks}`, 'Right tool called / not called / in the right order'],
    ['Tool call success', `${a.toolCallsOk}/${a.toolCalls} · ${pct(a.toolCallSuccessRate)}`, `${b.toolCallsOk}/${b.toolCalls} · ${pct(b.toolCallSuccessRate)}`, 'Calls returning ok. Counts safe rejections (e.g. wrong-name cancel) as unsuccessful'],
    ['Unsupported claims', `${a.incidents} in ${a.scenariosWithIncidents} scenarios`, `${b.incidents} in ${b.scenariosWithIncidents} scenarios`, 'Invented prices, ids, actions, insurance, medical advice, addresses'],
    ['Agent latency, mean / p95', `${a.latencyMeanMs.toFixed(3)} / ${a.latencyP95Ms.toFixed(3)} ms`, `${b.latencyMeanMs.toFixed(3)} / ${b.latencyP95Ms.toFixed(3)} ms`, `Measured over ${a.turnsMeasured} turns; in-process logic only, no speech/LLM/network`],
  ];
  return (<>
    <div className="row"><h2 style={{ margin: 0 }}>Deterministic results</h2><button className="btn sec" onClick={onRerun}>Re-run suite in your browser (run #{runs})</button></div>
    <p className="mute small">Same code as <code>npm run eval</code>. Pass/fail is deterministic; latency varies run to run.</p>
    <table><thead><tr><th>Metric</th><th>A · initial</th><th>B · improved</th><th className="hide-sm">Definition</th></tr></thead>
      <tbody>{rows.map(([m, x, y, d]) => <tr key={m}><td>{m}</td><td className="num">{x}</td><td className="num"><strong>{y}</strong></td><td className="hide-sm mute small">{d}</td></tr>)}</tbody></table>

    <h2>Before and after</h2>
    <div className="grid">
      <Group title={`Fixed by B (${c.fixed.length})`} ids={c.fixed} open={open} />
      <Group title={`Still failing in B (${c.remaining.length})`} ids={c.remaining} open={open} note="Known limits, not fixed. Open one to see the evidence." />
      <Group title={`Regressions (${c.regressions.length})`} ids={c.regressions} open={open} note={c.regressions.length ? '' : 'None: nothing A passed fails in B.'} />
      <Group title={`Passing in both (${c.stillPassing.length})`} ids={c.stillPassing} open={open} />
    </div>

    <h2>Pass rate by category</h2>
    <table><thead><tr><th>Category</th><th>A</th><th>B</th></tr></thead><tbody>
      {Object.keys(b.byCategory).map((k) => <tr key={k}><td>{k}</td><td className="num">{a.byCategory[k].passed}/{a.byCategory[k].total}</td><td className="num">{b.byCategory[k].passed}/{b.byCategory[k].total}</td></tr>)}
    </tbody></table>

    <h2>LLM-judge assessment (separate from the scores above)</h2>
    <div className="card small">Not run. The judge module exists (<code>npm run judge</code>, needs an Anthropic API key held by the operator) and is unit-tested against mocked HTTP, but it has not been executed against the live API, so no judge scores are shown.</div>
  </>);
}

function Group({ title, ids, open, note }: { title: string; ids: string[]; open: (id: string) => void; note?: string }) {
  return <div className="card"><h3 style={{ marginTop: 0 }}>{title}</h3>
    {note && <p className="mute small">{note}</p>}
    <div className="small">{ids.map((i, k) => <span key={i}>{k > 0 && ', '}<button className="linkbtn" onClick={() => open(i)}>{i}</button></span>)}</div></div>;
}

function Scenarios({ run, focus, setFocus }: { run: ReturnType<typeof runBoth>; focus: string | null; setFocus: (s: string | null) => void }) {
  const [filter, setFilter] = useState<'all' | 'failA' | 'failB' | 'fixed'>('all');
  const bm = new Map(run.B.map((r) => [r.scenarioId, r]));
  const rows = run.A.filter((a) => filter === 'all' || (filter === 'failA' && !a.pass) || (filter === 'failB' && !bm.get(a.scenarioId)!.pass) || (filter === 'fixed' && run.comparison.fixed.includes(a.scenarioId)));
  return (<>
    <div className="row"><label>Show <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
      <option value="all">all scenarios</option><option value="failA">failing in A</option><option value="failB">failing in B</option><option value="fixed">fixed by B</option></select></label>
      <span className="mute small">{rows.length} shown</span></div>
    <table style={{ marginTop: 8 }}><thead><tr><th>Scenario</th><th className="hide-sm">Category</th><th>A</th><th>B</th></tr></thead><tbody>
      {rows.map((a) => { const b = bm.get(a.scenarioId)!; return (<Fragment key={a.scenarioId}>
        <tr><td><button className="linkbtn" aria-expanded={focus === a.scenarioId} onClick={() => setFocus(focus === a.scenarioId ? null : a.scenarioId)}>{a.title}</button><div className="mute small">{a.scenarioId}</div></td>
          <td className="hide-sm">{a.category}</td><td><Pill pass={a.pass} /></td><td><Pill pass={b.pass} /></td></tr>
        {focus === a.scenarioId && <tr><td colSpan={4}><Detail a={a} b={b} /></td></tr>}</Fragment>); })}
    </tbody></table></>);
}

function Detail({ a, b }: { a: ScenarioResult; b: ScenarioResult }) {
  return (<div>
    <p><strong>Expected:</strong> {a.expected}</p>
    <div className="grid">{[a, b].map((r) => (<div className="card" key={r.configId}>
      <h3 style={{ marginTop: 0 }}>Version {r.configId} <Pill pass={r.pass} /></h3>
      <p className="small"><strong>Actual:</strong> {r.actual}</p>
      <table className="small"><tbody>{r.checks.map((c) => <tr key={c.name}><td><Pill pass={c.pass} /></td><td>{c.name}<div className="mute">{c.kind}{!c.pass && ` · ${c.detail}`}</div></td></tr>)}</tbody></table>
      {r.incidents.length > 0 && <p className="small" style={{ color: 'var(--bad)' }}>Unsupported claims: {r.incidents.map((i) => `${i.type} (${i.evidence})`).join('; ')}</p>}
      <details open={!r.pass}><summary>Transcript evidence</summary><Chat turns={r.transcript} /></details>
    </div>))}</div></div>);
}

function Chat({ turns }: { turns: ScenarioResult['transcript'] }) {
  return <div className="chat" role="log">{turns.map((t, i) => <div key={i} className={`msg ${t.role}`}>{t.text}
    {t.toolCalls?.map((c, j) => <div className="tool" key={j}>{toolLine(c)}</div>)}</div>)}</div>;
}
const toolLine = (c: ToolCall) => `▸ ${c.name}(${JSON.stringify(c.args)}) → ${c.result.ok ? 'ok' : 'ERROR'} ${JSON.stringify(c.result)}`;

function Try() {
  const [cfg, setCfg] = useState<'A' | 'B'>('B');
  const [{ sandbox, agent }, setSession] = useState(() => fresh('B'));
  const [log, setLog] = useState<ScenarioResult['transcript']>([]);
  const [text, setText] = useState('');
  const [, bump] = useState(0);
  function fresh(c: 'A' | 'B') { const sandbox = new Sandbox(); return { sandbox, agent: new Agent(CONFIGS[c], sandbox) }; }
  const reset = (c: 'A' | 'B') => { setCfg(c); setSession(fresh(c)); setLog([]); };
  const send = (e: React.FormEvent) => {
    e.preventDefault(); const u = text.trim(); if (!u) return;
    const r = agent.respond(u);
    setLog((l) => [...l, { role: 'user', text: u }, { role: 'agent', text: r.reply, toolCalls: r.toolCalls, ms: r.ms }]); setText(''); bump((n) => n + 1);
  };
  const active = sandbox.bookings.filter((b) => b.status === 'active');
  return (<div className="grid">
    <div className="card">
      <div className="row"><label>Agent <select value={cfg} onChange={(e) => reset(e.target.value as 'A' | 'B')}><option value="A">Version A (initial)</option><option value="B">Version B (improved)</option></select></label>
        <button className="btn sec" onClick={() => reset(cfg)}>New call</button></div>
      <p className="mute small">Type as the caller. Sandbox date: Monday, Nov 16, 2026. Try: “Book a cleaning Tuesday at 10am”, “How much is a root canal?”, “Can I speak to someone at the front desk?”. Text only; tool calls show under each reply.</p>
      <Chat turns={log} />
      <form onSubmit={send}><label className="sr" style={{ display: 'none' }} htmlFor="u">Caller message</label>
        <input id="u" type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what the caller says…" autoComplete="off" /><button className="btn" type="submit">Send</button></form>
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Sandbox appointments (synthetic)</h3>
      <table className="small"><thead><tr><th>ID</th><th>Patient</th><th>When</th></tr></thead><tbody>
        {active.map((b) => <tr key={b.id}><td>{b.id}</td><td>{b.name}</td><td>{prettyDate(b.date)} {prettyTime(b.time)}</td></tr>)}</tbody></table>
      <p className="mute small">Resets with “New call”. Nothing is stored or sent anywhere.</p></div>
  </div>);
}

function Config() {
  const keys = Object.keys(CHANGE_NOTES) as (keyof typeof CHANGE_NOTES)[];
  const show = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v);
  const changed = keys.filter((k) => show(CONFIGS.A[k]) !== show(CONFIGS.B[k]));
  return (<><p>{changed.length} settings differ between the two configurations. This table is generated from the config objects used in the test runs.</p>
    <table><thead><tr><th>Setting</th><th>A</th><th>B</th><th className="hide-sm">Why</th></tr></thead><tbody>
      {changed.map((k) => <tr key={k}><td><code>{k}</code></td><td>{show(CONFIGS.A[k])}</td><td>{show(CONFIGS.B[k])}</td><td className="hide-sm small">{CHANGE_NOTES[k]}</td></tr>)}</tbody></table>
    <h2>Limitations</h2><ul className="small">
      <li>Agents are rule-based simulators. Configuration flags encode typical weak vs. improved behavior; the harness (scenarios, checks, metrics, diffing) is the reusable part and is agent-agnostic.</li>
      <li>Scenarios were written by one author and B was tuned until it passed the first 33, so B’s perfect score is not evidence of general quality. Three probes (category “Added after tuning”) were written afterwards and not tuned against.</li>
      <li>Compound requests and dates spoken as words failed in the first version of B and were fixed; they stay in the suite as regression tests.</li>
      <li>Latency covers agent logic only. No speech recognition, synthesis, LLM, or network time.</li>
    </ul></>);
}
