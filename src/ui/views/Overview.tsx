import { useMemo } from 'react';
import type { AgentMetrics } from '../../llm/metrics';
import type { EvalRun } from '../../llm/types';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { findings, scenarioRows, VERDICT_LABEL, verdictTone } from '../app/selectors';
import { count, ms, pct, usd, when } from '../components/format';
import { Badge, Notice, Panel, RateBar, TrialStrip } from '../components/ui';

interface Row { label: string; hint: string; a: string; b: string; rates?: [number, number]; delta?: string }
const signed = (d: number, digits = 1) => `${d > 0 ? '+' : ''}${(d * 100).toFixed(digits)} pts`;

function metricRows(a: AgentMetrics, b: AgentMetrics): Row[] {
  return [
    { label: 'Pass rate', hint: 'Every deterministic check passed', a: `${a.passed}/${a.trials} · ${pct(a.passRate)}`, b: `${b.passed}/${b.trials} · ${pct(b.passRate)}`, rates: [a.passRate, b.passRate], delta: signed(b.passRate - a.passRate) },
    { label: 'Task completion', hint: 'Goal reached, judged from database and tool state only', a: pct(a.completionRate), b: pct(b.completionRate), rates: [a.completionRate, b.completionRate], delta: signed(b.completionRate - a.completionRate) },
    { label: 'Tool-call success', hint: 'Calls that returned ok; safe rejections (wrong owner, taken slot) count as not ok', a: `${a.toolCallsOk}/${a.toolCalls}`, b: `${b.toolCallsOk}/${b.toolCalls}`, rates: [a.toolCallSuccessRate ?? 0, b.toolCallSuccessRate ?? 0] },
    { label: 'Unsupported claims', hint: 'Invented prices, ids, actions, insurance or addresses (regex detectors)', a: String(a.unsupportedClaims), b: String(b.unsupportedClaims) },
    { label: 'Safety violations', hint: 'Failed safety checks: emergencies, medical advice, privacy, wrong-owner changes', a: String(a.safetyViolations), b: String(b.safetyViolations) },
    { label: 'API errors', hint: 'Turns where the model call failed', a: String(a.errors), b: String(b.errors) },
    { label: 'Latency per turn (mean / p95)', hint: 'Wall-clock per caller message, all model and tool calls included', a: `${ms(a.latencyMeanMs)} / ${ms(a.latencyP95Ms)}`, b: `${ms(b.latencyMeanMs)} / ${ms(b.latencyP95Ms)}` },
    { label: 'Tokens in / out', hint: 'As reported by the API', a: `${count(a.inputTokens)} / ${count(a.outputTokens)}`, b: `${count(b.inputTokens)} / ${count(b.outputTokens)}` },
    { label: 'Agent cost', hint: 'Tokens × list price', a: usd(a.costUsd), b: usd(b.costUsd) },
  ];
}

export default function Overview() {
  const { status, error, run, summary } = useRun();
  if (status === 'loading') return <p className="muted" role="status">Loading recorded results…</p>;
  if (!run || !summary) return <Notice tone="warn" title="No recorded evaluation in this deployment">{error ? `(${error}) ` : ''}Nothing is shown instead of placeholder numbers.</Notice>;
  return <OverviewBody run={run} summary={summary} />;
}

function OverviewBody({ run, summary }: { run: EvalRun; summary: NonNullable<ReturnType<typeof useRun>['summary']> }) {
  const rows = useMemo(() => scenarioRows(run), [run]);
  const diff = rows.filter((r) => r.verdict !== 'both_pass');
  const notes = useMemo(() => findings(run, summary.A, summary.B, rows), [run, summary, rows]);
  const j = summary.judge;
  return (
    <div className="stack-lg">
      <Panel>
        <Panel.Head title="What the results say" aside={<>Run {when(run.startedAt)} · <span className="mono">{run.model}</span></>} />
        <Panel.Body>
          <ul className="findings">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="Where the agents differ" aside={`${diff.length} of ${rows.length} scenarios`} />
        <Panel.Table label="Scenarios where the agents differ">
          <table>
            <caption className="sr-only">Scenarios where Agent A and Agent B did not behave the same, with each trial’s result</caption>
            <thead><tr><th scope="col">Scenario</th><th scope="col"><span className="agent-dot a" />A trials</th><th scope="col"><span className="agent-dot b" />B trials</th><th scope="col" className="hide-sm">Result</th></tr></thead>
            <tbody>
              {diff.length === 0 ? <tr><td colSpan={4} className="muted">No differences.</td></tr> : diff.map((r) => (
                <tr key={r.scenarioId}>
                  <th scope="row"><a href={href({ section: 'scenarios', param: r.scenarioId })}>{r.title}</a><div className="muted small">{r.category}</div><div className="show-sm"><Badge tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Badge></div></th>
                  <td><TrialStrip results={r.a.results} label="Agent A" /></td>
                  <td><TrialStrip results={r.b.results} label="Agent B" /></td>
                  <td className="hide-sm"><Badge tone={verdictTone(r.verdict)}>{VERDICT_LABEL[r.verdict]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel.Table>
      </Panel>

      <Panel>
        <Panel.Head title="Metrics" aside={`${run.scenarioIds.length} scenarios × ${run.trialsPerScenario} trials per agent, fresh database each time`} />
        <Panel.Table label="Agent metrics">
          <table>
            <caption className="sr-only">Agent A and Agent B metrics computed from recorded traces</caption>
            <thead><tr><th scope="col">Metric</th><th scope="col"><span className="agent-dot a" />Agent A · initial</th><th scope="col"><span className="agent-dot b" />Agent B · improved</th><th scope="col" className="r hide-sm">B − A</th></tr></thead>
            <tbody>
              {metricRows(summary.A, summary.B).map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}<div className="muted small">{r.hint}</div></th>
                  <td className="num"><span className="rate">{r.a}{r.rates ? <RateBar value={r.rates[0]} agent="a" /> : null}</span></td>
                  <td className="num"><span className="rate">{r.b}{r.rates ? <RateBar value={r.rates[1]} agent="b" /> : null}</span></td>
                  <td className="r num hide-sm muted">{r.delta ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel.Table>
        <Panel.Body><p className="muted small">Computed in your browser from the saved traces; nothing is hardcoded. Agent spend for this run {usd(summary.A.costUsd + summary.B.costUsd)}{run.judgeCostUsd ? `, judge ${usd(run.judgeCostUsd)}` : ''}.</p></Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="Failures by category" aside="Each failed trial counts under its most severe failed check" />
        <Panel.Table label="Failures by category">
          <table>
            <caption className="sr-only">Failed trials by category for each agent</caption>
            <thead><tr><th scope="col">Category</th><th scope="col" className="r">A</th><th scope="col" className="r">B</th></tr></thead>
            <tbody>
              {(['safety', 'outcome', 'tool_use', 'accuracy', 'api_error'] as const).map((c) => (
                <tr key={c}><th scope="row">{c.replace('_', ' ')}</th><td className="r num">{summary.A.failureCategories[c] ?? 0}</td><td className="r num">{summary.B.failureCategories[c] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel.Table>
      </Panel>

      <Panel>
        <Panel.Head title="LLM judge (separate from pass/fail)" aside={run.judgeModel ? <span className="mono">{run.judgeModel}</span> : undefined} />
        <Panel.Body>
          {run.judgeModel ? (
            <>
              <Panel.Table label="Judge scores">
                <table>
                  <caption className="sr-only">Average judge scores per agent on a 1 to 5 scale</caption>
                  <thead><tr><th scope="col">Agent</th><th scope="col" className="r">Judged</th><th scope="col" className="r">Clarity</th><th scope="col" className="r">Helpfulness</th><th scope="col" className="r">Completeness</th></tr></thead>
                  <tbody>
                    {(['A', 'B'] as const).map((a) => (
                      <tr key={a}><th scope="row">Agent {a}</th><td className="r num">{j[a].n}</td>{[j[a].clarity, j[a].helpfulness, j[a].completeness].map((v, i) => <td className="r num" key={i}>{v === null ? 'n/a' : v.toFixed(2)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </Panel.Table>
              <p className="muted small" style={{ marginTop: 8 }}>A different model grades clarity, helpfulness and completeness from 1 to 5 on the first trial of each scenario. These are opinions about conversation quality. They never decide pass or fail and are not evidence that an action succeeded.</p>
            </>
          ) : <p className="muted">The judge was not run for this evaluation.</p>}
        </Panel.Body>
      </Panel>
    </div>
  );
}
