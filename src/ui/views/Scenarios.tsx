import { useMemo, useState } from 'react';
import type { AgentId, EvalRun, Trial } from '../../llm/types';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { scenarioRows, VERDICT_LABEL, verdictTone, type ScenarioRow } from '../app/selectors';
import { Transcript } from '../components/Transcript';
import { Badge, Notice, PassBadge, Panel, TrialStrip } from '../components/ui';

type Show = 'all' | 'differences' | 'failures';
const FAILURE_TYPES = ['safety', 'outcome', 'tool_use', 'accuracy', 'api_error'] as const;

export default function Scenarios({ id }: { id?: string }) {
  const { status, run } = useRun();
  if (status === 'loading') return <p className="muted" role="status">Loading recorded results…</p>;
  if (!run) return <Notice tone="warn" title="No recorded evaluation in this deployment" />;
  return id ? <Detail run={run} id={id} /> : <List run={run} />;
}

function List({ run }: { run: EvalRun }) {
  const rows = useMemo(() => scenarioRows(run), [run]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const [show, setShow] = useState<Show>('all');
  const [category, setCategory] = useState('all');
  const [failure, setFailure] = useState('all');
  const shown = rows.filter((r) =>
    (show === 'all' || (show === 'differences' && r.verdict !== 'both_pass') || (show === 'failures' && r.failureTypes.length > 0)) &&
    (category === 'all' || r.category === category) && (failure === 'all' || r.failureTypes.includes(failure)));
  return (
    <div className="stack">
      <div className="cluster" role="group" aria-label="Filters">
        <label className="field">Show
          <select value={show} onChange={(e) => setShow(e.target.value as Show)}>
            <option value="all">All scenarios</option><option value="differences">Where agents differ</option><option value="failures">Any failed trial</option>
          </select>
        </label>
        <label className="field">Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">Failure type
          <select value={failure} onChange={(e) => setFailure(e.target.value)}>
            <option value="all">Any</option>{FAILURE_TYPES.map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
          </select>
        </label>
        <p className="muted small" role="status" aria-live="polite">{shown.length} of {rows.length} scenarios</p>
      </div>
      <Panel>
        <Panel.Table label="Scenarios">
          <table>
            <caption className="sr-only">Every scenario with each agent’s trial results</caption>
            <thead><tr><th scope="col">Scenario</th><th scope="col" className="hide-sm">Category</th><th scope="col"><span className="agent-dot a" />A</th><th scope="col"><span className="agent-dot b" />B</th><th scope="col" className="hide-sm">Result</th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={5} className="muted">No scenarios match these filters.</td></tr> : shown.map((r) => (
                <tr key={r.scenarioId}>
                  <th scope="row"><a href={href({ section: 'scenarios', param: r.scenarioId })}>{r.title}</a><div className="muted small mono">{r.scenarioId}</div><div className="show-sm"><Badge tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Badge></div></th>
                  <td className="hide-sm">{r.category}</td>
                  <td><TrialStrip results={r.a.results} label="Agent A" /></td>
                  <td><TrialStrip results={r.b.results} label="Agent B" /></td>
                  <td className="hide-sm"><Badge tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel.Table>
      </Panel>
    </div>
  );
}

function Detail({ run, id }: { run: EvalRun; id: string }) {
  const row: ScenarioRow | undefined = useMemo(() => scenarioRows(run).find((r) => r.scenarioId === id), [run, id]);
  const trials = useMemo(() => run.trials.filter((t) => t.scenarioId === id).sort((a, b) => a.agent.localeCompare(b.agent) || a.trial - b.trial), [run, id]);
  if (!row || !trials.length) return <Notice tone="warn" title="Scenario not found">No recorded trials for “{id}”. <a href={href({ section: 'scenarios' })}>Back to all scenarios</a></Notice>;
  return (
    <div className="stack-lg">
      <p><a href={href({ section: 'scenarios' })}>← All scenarios</a></p>
      <Panel>
        <Panel.Head title={row.title} aside={row.category} />
        <Panel.Body>
          <dl className="kv">
            <dt>Expected</dt><dd>{trials[0].expected}</dd>
            <dt>Agent A</dt><dd><TrialStrip results={row.a.results} label="Agent A" /> <span className="muted small">{row.a.passed}/{row.a.n} passed</span></dd>
            <dt>Agent B</dt><dd><TrialStrip results={row.b.results} label="Agent B" /> <span className="muted small">{row.b.passed}/{row.b.n} passed</span></dd>
            <dt>Result</dt><dd><Badge tone={verdictTone(row.verdict)}>{VERDICT_LABEL[row.verdict]}</Badge></dd>
          </dl>
        </Panel.Body>
      </Panel>
      {(['A', 'B'] as AgentId[]).map((agent) => (
        <section key={agent} aria-labelledby={`h-${agent}`} className="stack">
          <h2 id={`h-${agent}`}><span className={`agent-dot ${agent.toLowerCase()}`} />Agent {agent}</h2>
          <div className="trial-grid">{trials.filter((t) => t.agent === agent).map((t) => <TrialCard key={t.trial} t={t} />)}</div>
        </section>
      ))}
    </div>
  );
}

function TrialCard({ t }: { t: Trial }) {
  const changed = t.finalBookings.filter((b) => b.change !== 'seed');
  return (
    <Panel>
      <Panel.Head level={3} title={`Trial ${t.trial}`} aside={<><PassBadge pass={t.pass} />{t.pass ? null : <> <Badge tone="neutral">{t.failureCategory.replace('_', ' ')}</Badge></>}</>} />
      <Panel.Body>
        <div className="stack">
          <ul className="checks">
            {t.checks.map((c) => (
              <li key={c.name}><PassBadge pass={c.pass} /><span>{c.name}<span className="muted small"> · {c.kind}{c.pass ? '' : ` · ${c.detail}`}</span></span></li>
            ))}
          </ul>
          <p className="small"><strong>Database changes:</strong>{' '}
            {changed.length || t.handoffs.length
              ? <>{changed.map((b) => `${b.code} ${b.change} (${b.service} ${b.date} ${b.time}, ${b.status})`).join('; ')}{t.handoffs.length ? `${changed.length ? '; ' : ''}handoff recorded: ${t.handoffs.join('; ')}` : ''}</>
              : 'none, seed data untouched'}
          </p>
          {t.judge ? <p className="small"><strong>Judge</strong> (not pass/fail): clarity {t.judge.clarity}, helpfulness {t.judge.helpfulness}, completeness {t.judge.completeness}. <span className="muted">{t.judge.rationale}</span></p> : null}
          <details open={!t.pass}><summary>Transcript and tool calls</summary><Transcript turns={t.turns} /></details>
        </div>
      </Panel.Body>
    </Panel>
  );
}
