import { useMemo } from 'react';
import type { EvalRun } from '../../llm/types';
import { categoryRates, headline, insights, summaryCards, writtenSummary } from '../app/insights';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { scenarioRows } from '../app/selectors';
import { count, ms, pct, usd, when } from '../components/format';
import { Notice, Panel, RateBar, Skeleton } from '../components/ui';

export default function Overview() {
  const { status, error, run, summary } = useRun();
  if (status === 'loading') return <div className="stack-lg"><Skeleton height={64} /><Skeleton height={140} /><Skeleton height={260} /></div>;
  if (!run || !summary) return <Notice tone="warn" title="No recorded evaluation in this deployment">{error ? `(${error}) ` : ''}Nothing is shown instead of placeholder numbers.</Notice>;
  return <Body run={run} summary={summary} />;
}

function Body({ run, summary }: { run: EvalRun; summary: NonNullable<ReturnType<typeof useRun>['summary']> }) {
  const { A: a, B: b } = summary;
  const rows = useMemo(() => scenarioRows(run), [run]);
  const cards = useMemo(() => summaryCards(run, a, b, rows), [run, a, b, rows]);
  const notes = useMemo(() => insights(run, a, b, rows, summary.judge), [run, a, b, rows, summary.judge]);
  const cats = useMemo(() => categoryRates(a, b), [a, b]);
  const j = summary.judge;
  const cmp: [string, string, string][] = [
    ['Pass rate', pct(a.passRate), pct(b.passRate)],
    ['Task completion', pct(a.completionRate), pct(b.completionRate)],
    ['Tool-call success', `${a.toolCallsOk}/${a.toolCalls}`, `${b.toolCallsOk}/${b.toolCalls}`],
    ['Unsupported claims', String(a.unsupportedClaims), String(b.unsupportedClaims)],
    ['Safety violations', String(a.safetyViolations), String(b.safetyViolations)],
    ['Latency per turn, mean', ms(a.latencyMeanMs), ms(b.latencyMeanMs)],
    ['Latency per turn, p95', ms(a.latencyP95Ms), ms(b.latencyP95Ms)],
    ['Tokens in / out', `${count(a.inputTokens)} / ${count(a.outputTokens)}`, `${count(b.inputTokens)} / ${count(b.outputTokens)}`],
    ['Agent cost', usd(a.costUsd), usd(b.costUsd)],
    ...(run.judgeModel && j.A.helpfulness !== null && j.B.helpfulness !== null ? [['Judge: helpfulness (1–5, separate)', j.A.helpfulness.toFixed(2), j.B.helpfulness.toFixed(2)] as [string, string, string]] : []),
  ];
  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 tabIndex={-1}>Evaluation overview</h1>
        <p>{headline(run, a, b)}</p>
        <p className="muted small">Run {when(run.startedAt)} · <span className="mono">{run.model}</span> · {run.trialsPerScenario} trials per scenario · every figure computed from the saved traces.</p>
      </header>

      <section aria-label="Key results" className="stat-grid">
        {cards.map((c) => (
          <div key={c.label} className={`stat ${c.tone === 'neutral' ? '' : c.tone}`}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-pair">
              <div><span className="stat-v col-a">{c.a}</span><span className="stat-k">Agent A</span></div>
              <div><span className="stat-v col-b">{c.b}</span><span className="stat-k">Agent B</span></div>
            </div>
            <p className="stat-help">{c.help}</p>
          </div>
        ))}
      </section>

      <Panel>
        <Panel.Head title="What stands out" aside="Written from the data" />
        <Panel.Body>
          {notes.length ? notes.map((n) => <div className="insight" key={n.title}><h3>{n.title}</h3><p>{n.body}</p></div>) : <p className="muted">No notable differences in this run.</p>}
          <p style={{ marginTop: 14 }}><a className="textlink" href={href({ section: 'scenarios' })}>Open the scenarios behind these results</a></p>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="Agent A and Agent B, side by side" aside="Same model, tools and data; different instructions" />
        <Panel.Table label="Agent A versus Agent B">
          <table>
            <caption className="sr-only">Metrics for Agent A and Agent B computed from recorded traces</caption>
            <thead><tr><th scope="col">Metric</th><th scope="col" className="r"><span className="agent-dot a" />Agent A · initial</th><th scope="col" className="r"><span className="agent-dot b" />Agent B · improved</th></tr></thead>
            <tbody>{cmp.map(([k, x, y]) => <tr key={k}><th scope="row">{k}</th><td className="r num">{x}</td><td className="r num"><strong>{y}</strong></td></tr>)}</tbody>
          </table>
        </Panel.Table>
      </Panel>

      <Panel>
        <Panel.Head title="Pass rate by scenario category" aside={<><span className="agent-dot a" />A <span className="agent-dot b" style={{ marginLeft: 8 }} />B</>} />
        <Panel.Body>
          <div className="catbars">
            {cats.map((c) => (
              <div className="catbar" key={c.category}>
                <div><div style={{ fontWeight: 550 }}>{c.category}</div><div className="vals">{c.n} trials per agent</div></div>
                <div className="bars" role="img" aria-label={`${c.category}: Agent A ${pct(c.a)}, Agent B ${pct(c.b)}`}>
                  <RateBar value={c.a} agent="a" /><RateBar value={c.b} agent="b" />
                  <div className="vals">A {pct(c.a)} · B {pct(c.b)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel.Body>
      </Panel>

      <Panel soft>
        <Panel.Body>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Summary</h2>
          <p className="ink2" style={{ maxWidth: '72ch' }}>{writtenSummary(run, a, b, rows)}</p>
          <p className="muted small" style={{ marginTop: 10 }}>Judge-model scores are opinions about conversation quality and never decide pass or fail. Method and limitations: <a href={href({ section: 'method' })}>Agents and method</a>.</p>
        </Panel.Body>
      </Panel>
    </div>
  );
}
