import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentId, EvalRun, Trial } from '../../llm/types';
import { CHECK_KIND_HELP, whyItMatters } from '../app/scenarioInfo';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { scenarioRows, VERDICT_LABEL, verdictTone, type ScenarioRow } from '../app/selectors';
import { ms, usd } from '../components/format';
import { Transcript } from '../components/Transcript';
import { Badge, EventCard, Notice, PassBadge, Segmented, Skeleton, Tabs, Tag, TrialStrip } from '../components/ui';

type Result = 'all' | 'differences' | 'failures' | 'passing';
const FAILURE_TYPES = ['safety', 'outcome', 'tool_use', 'accuracy', 'api_error'] as const;
const label = (s: string) => s.replace('_', ' ');

export default function Scenarios({ id }: { id?: string }) {
  const { status, run } = useRun();
  if (status === 'loading') return <Skeleton height={420} />;
  if (!run) return <Notice tone="warn" title="No recorded evaluation in this deployment">Nothing is shown instead of placeholder numbers.</Notice>;
  return <MasterDetail run={run} id={id} />;
}

function MasterDetail({ run, id }: { run: EvalRun; id?: string }) {
  const rows = useMemo(() => scenarioRows(run), [run]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [result, setResult] = useState<Result>('all');
  const [failure, setFailure] = useState('all');
  const shown = rows.filter((r) =>
    (!q || `${r.title} ${r.scenarioId} ${r.category}`.toLowerCase().includes(q.toLowerCase())) &&
    (category === 'all' || r.category === category) &&
    (result === 'all' || (result === 'differences' && r.verdict !== 'both_pass') || (result === 'failures' && r.failureTypes.length > 0) || (result === 'passing' && r.failureTypes.length === 0)) &&
    (failure === 'all' || r.failureTypes.includes(failure)));
  const fallback = rows.find((r) => r.verdict !== 'both_pass') ?? rows[0];
  const selected = rows.find((r) => r.scenarioId === id) ?? (id ? undefined : fallback);
  const itemsRef = useRef<HTMLElement>(null);
  useEffect(() => { itemsRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' }); }, [selected?.scenarioId]);

  return (
    <div className={id ? 'md has-detail' : 'md'}>
      <aside className="md-list" aria-label="Scenario list">
        <div className="stack-sm">
          <label className="field">Search<input type="search" name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scenarios…" autoComplete="off" /></label>
          <div className="grid-2" style={{ gap: 8 }}>
            <label className="field">Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field">Result
              <select value={result} onChange={(e) => setResult(e.target.value as Result)}>
                <option value="all">All</option><option value="differences">Agents differ</option><option value="failures">Any failure</option><option value="passing">All passing</option>
              </select>
            </label>
          </div>
          <label className="field">Failure type
            <select value={failure} onChange={(e) => setFailure(e.target.value)}><option value="all">Any</option>{FAILURE_TYPES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
          </label>
          <p className="muted tiny" role="status" aria-live="polite">{shown.length} of {rows.length} scenarios</p>
        </div>
        <nav className="md-items" aria-label="Scenarios" ref={itemsRef}>
          {shown.length === 0 ? <p className="muted small" style={{ padding: 12 }}>No scenarios match. Clear a filter to see more.</p> : shown.map((r) => (
            <a key={r.scenarioId} className="item" href={href({ section: 'scenarios', param: r.scenarioId })} aria-current={selected?.scenarioId === r.scenarioId ? 'true' : undefined}>
              <span className="item-title">{r.title}</span>
              <span className="item-meta"><Tag>{r.category}</Tag>{r.failureTypes.map((f) => <Tag key={f} fail>{label(f)}</Tag>)}</span>
              <span className="item-agents">
                <span><span className="agent-dot a" style={{ margin: 0 }} />A <TrialStrip results={r.a.results} label="Agent A" /></span>
                <span><span className="agent-dot b" style={{ margin: 0 }} />B <TrialStrip results={r.b.results} label="Agent B" /></span>
              </span>
            </a>
          ))}
        </nav>
      </aside>
      <section className="md-detail" aria-label="Scenario detail">
        {selected ? <Detail key={selected.scenarioId} run={run} row={selected} /> : <Notice tone="warn" title="Scenario not found">No recorded trials for “{id}”. <a href={href({ section: 'scenarios' })}>See all scenarios</a></Notice>}
      </section>
    </div>
  );
}

type TabId = 'transcript' | 'tools' | 'state' | 'checks' | 'notes';
const TABS: { value: TabId; label: string }[] = [
  { value: 'transcript', label: 'Transcript' }, { value: 'tools', label: 'Tool calls' }, { value: 'state', label: 'Final state' }, { value: 'checks', label: 'Checks' }, { value: 'notes', label: 'Notes' },
];

function Detail({ run, row }: { run: EvalRun; row: ScenarioRow }) {
  const trials = useMemo(() => run.trials.filter((t) => t.scenarioId === row.scenarioId), [run, row.scenarioId]);
  const firstFail = trials.find((t) => !t.pass);
  const [agent, setAgent] = useState<AgentId>(firstFail?.agent ?? 'B');
  const [trialNo, setTrialNo] = useState<number>(firstFail?.trial ?? 1);
  const [tab, setTab] = useState<TabId>('transcript');
  const forAgent = trials.filter((t) => t.agent === agent).sort((x, y) => x.trial - y.trial);
  const trial = forAgent.find((t) => t.trial === trialNo) ?? forAgent[0];
  const sample = trials[0];

  return (
    <div className="stack-lg">
      <div className="stack">
        <a className="back-link textlink" href={href({ section: 'scenarios' })}>← All scenarios</a>
        <div className="cluster between" style={{ alignItems: 'flex-start' }}>
          <div className="stack-sm"><h2 style={{ fontSize: '1.4rem' }}>{row.title}</h2><div className="cluster" style={{ gap: 8 }}><Tag>{row.category}</Tag><span className="mono tiny muted">{row.scenarioId}</span></div></div>
          <Badge tone={verdictTone(row.verdict)}>{VERDICT_LABEL[row.verdict]}</Badge>
        </div>
        <div className="facts">
          <div className="fact"><span className="fact-k">USER REQUEST</span><span>“{sample.turns[0].user}”{sample.turns.length > 1 ? <span className="muted small"> (+{sample.turns.length - 1} follow-up message{sample.turns.length > 2 ? 's' : ''})</span> : null}</span></div>
          <div className="fact"><span className="fact-k">WHY IT MATTERS</span><span className="ink2">{whyItMatters(row.category)}</span></div>
          <div className="fact"><span className="fact-k">EXPECTED BEHAVIOR</span><span>{sample.expected}</span></div>
          <div className="fact"><span className="fact-k">OVERALL RESULT</span>
            <span className="stack-sm">
              <span className="cluster" style={{ gap: 10 }}><span className="agent-dot a" style={{ margin: 0 }} />Agent A <TrialStrip results={row.a.results} label="Agent A" /><span className="muted small">{row.a.passed}/{row.a.n}</span></span>
              <span className="cluster" style={{ gap: 10 }}><span className="agent-dot b" style={{ margin: 0 }} />Agent B <TrialStrip results={row.b.results} label="Agent B" /><span className="muted small">{row.b.passed}/{row.b.n}</span></span>
            </span>
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="cluster between">
          <div className="cluster" style={{ gap: 12 }}>
            <Segmented label="Agent" value={agent} onChange={(v) => { setAgent(v); setTrialNo(1); }} options={[{ value: 'A', label: 'Agent A' }, { value: 'B', label: 'Agent B' }]} />
            <Segmented label="Trial" value={String(trial.trial)} onChange={(v) => setTrialNo(Number(v))} options={forAgent.map((t) => ({ value: String(t.trial), label: `Trial ${t.trial}${t.pass ? '' : ' ✕'}` }))} />
          </div>
          <span className="cluster" style={{ gap: 8 }}><PassBadge pass={trial.pass} />{trial.pass ? null : <Tag fail>{label(trial.failureCategory)}</Tag>}</span>
        </div>
        <Tabs label="Trial details" value={tab} tabs={TABS} onChange={setTab} idPrefix="trial">
          {tab === 'transcript' && <Transcript turns={trial.turns} />}
          {tab === 'tools' && <ToolCalls trial={trial} />}
          {tab === 'state' && <FinalState trial={trial} />}
          {tab === 'checks' && <Checks trial={trial} />}
          {tab === 'notes' && <Notes row={row} trial={trial} />}
        </Tabs>
      </div>
    </div>
  );
}

function ToolCalls({ trial }: { trial: Trial }) {
  const calls = trial.turns.flatMap((t, i) => t.toolCalls.map((c) => ({ ...c, turn: i + 1 })));
  if (!calls.length) return <p className="muted">The agent called no tools in this conversation{trial.pass ? ', which is what the scenario expects or allows.' : '.'}</p>;
  return <div className="events">{calls.map((c, i) => <EventCard key={i} name={c.name} ok={c.result.ok} when={`turn ${c.turn} · ${ms(c.ms)}`} input={c.input} result={c.result} />)}</div>;
}

function FinalState({ trial }: { trial: Trial }) {
  const changed = trial.finalBookings.filter((b) => b.change !== 'seed');
  return (
    <div className="stack">
      <p className="ink2 small">{changed.length || trial.handoffs.length ? 'The conversation changed the database as shown. Pass/fail on data outcomes is decided from this state, not from what the agent said.' : 'The seed data was left untouched.'}</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Database bookings after the conversation">
        <table>
          <caption className="sr-only">Bookings in the conversation’s database after it ended</caption>
          <thead><tr><th scope="col">Code</th><th scope="col">Patient</th><th scope="col">Service</th><th scope="col">When</th><th scope="col">Status</th><th scope="col">Change</th></tr></thead>
          <tbody>
            {trial.finalBookings.map((b) => (
              <tr key={b.code} style={b.change === 'seed' ? { opacity: 0.6 } : undefined}>
                <th scope="row" className="mono">{b.code}</th><td>{b.name}</td><td>{b.service}</td><td className="num">{b.date} {b.time}</td><td>{b.status}</td>
                <td>{b.change === 'seed' ? <span className="muted">unchanged</span> : <Badge tone="accent">{b.change}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {trial.handoffs.length ? <p><strong>Handoff recorded:</strong> {trial.handoffs.join('; ')}</p> : null}
    </div>
  );
}

function Checks({ trial }: { trial: Trial }) {
  return (
    <div className="stack">
      <ul className="checks">
        {trial.checks.map((c) => (
          <li key={c.name}><PassBadge pass={c.pass} /><span>{c.name} <Tag>{c.kind}</Tag>{c.pass ? null : <span className="small" style={{ display: 'block', color: 'var(--fail)' }}>{c.detail}</span>}</span></li>
        ))}
      </ul>
      {trial.incidents.length ? (
        <div><h3 style={{ marginBottom: 6 }}>Unsupported claims detected</h3>
          <ul className="checks">{trial.incidents.map((i, n) => <li key={n}><Badge tone="fail">{i.type.replace(/_/g, ' ')}</Badge><span className="small">{i.evidence}</span></li>)}</ul></div>
      ) : null}
    </div>
  );
}

function Notes({ row, trial }: { row: ScenarioRow; trial: Trial }) {
  const cost = trial.turns.reduce((n, t) => n + t.costUsd, 0);
  const tokens = trial.turns.reduce((n, t) => n + t.inputTokens + t.outputTokens, 0);
  const lat = trial.turns.reduce((n, t) => n + t.totalMs, 0) / Math.max(trial.turns.length, 1);
  const failed = trial.checks.filter((c) => !c.pass);
  const kinds = [...new Set(trial.checks.map((c) => c.kind))];
  return (
    <div className="stack">
      <dl className="kv">
        <dt>Consistency</dt><dd>Agent A passed {row.a.passed} of {row.a.n} trials; Agent B passed {row.b.passed} of {row.b.n}.{row.verdict === 'flaky' ? ' Same input produced different outcomes across trials.' : ''}</dd>
        <dt>This trial</dt><dd>{trial.turns.length} caller message{trial.turns.length === 1 ? '' : 's'}, {tokens.toLocaleString()} tokens, {usd(cost)}, {ms(lat)} mean per turn.</dd>
        <dt>What failed</dt><dd>{failed.length ? failed.map((c) => `${c.name} (${c.detail})`).join('; ') : 'Nothing; every check passed.'}</dd>
      </dl>
      {trial.judge ? (
        <div className="panel soft"><div className="panel-body"><h3>Judge model (opinion, not pass/fail)</h3>
          <p className="small" style={{ marginTop: 6 }}>Clarity {trial.judge.clarity}/5 · helpfulness {trial.judge.helpfulness}/5 · completeness {trial.judge.completeness}/5</p>
          <p className="small ink2" style={{ marginTop: 4 }}>{trial.judge.rationale}</p></div></div>
      ) : null}
      <div><h3 style={{ marginBottom: 6 }}>What the check types mean</h3>
        <ul className="checks">{kinds.map((k) => <li key={k}><Tag>{k}</Tag><span className="small ink2">{CHECK_KIND_HELP[k]}</span></li>)}</ul></div>
    </div>
  );
}
