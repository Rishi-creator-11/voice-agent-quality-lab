import { Fragment, useMemo, useState } from 'react';
import { summarizeRun, type AgentMetrics, type Verdict } from '../llm/metrics';
import type { AgentId, EvalRun, Trial } from '../llm/types';
import { Pill, ms, pct, usd } from './common';

export function Transcript({ trial }: { trial: Trial }) {
  return (
    <div className="chat" role="log" aria-label="Transcript">
      {trial.turns.map((t, i) => (
        <Fragment key={i}>
          <div className="msg user">{t.user}</div>
          <div className="msg agent">
            {t.error ? <em>API error: {t.error}</em> : t.reply || <em>(no reply)</em>}
            {t.toolCalls.map((c, j) => (
              <div className="tool" key={j}>▸ {c.name}({JSON.stringify(c.input)}) → {c.result.ok ? 'ok' : 'ERROR'} {JSON.stringify(c.result)}</div>
            ))}
            <div className="tool">{t.llmCalls} model call(s) · {t.inputTokens}+{t.outputTokens} tokens · {ms(t.totalMs)} · {usd(t.costUsd)}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export function TrialDetail({ t }: { t: Trial }) {
  const changed = t.finalBookings.filter((b) => b.change !== 'seed');
  return (
    <div className="card" style={{ marginTop: 6 }}>
      <h3 style={{ marginTop: 0 }}>Agent {t.agent} · trial {t.trial} <Pill pass={t.pass} /> {!t.pass && <span className="pill fail">{t.failureCategory}</span>}</h3>
      <p className="small"><strong>Expected:</strong> {t.expected}</p>
      <table className="small"><tbody>
        {t.checks.map((c) => (
          <tr key={c.name}><td><Pill pass={c.pass} /></td><td>{c.name}<div className="mute">{c.kind}{!c.pass && ` · ${c.detail}`}</div></td></tr>
        ))}
      </tbody></table>
      <p className="small"><strong>Final database changes:</strong>{' '}
        {changed.length || t.handoffs.length ? (
          <>
            {changed.map((b) => `${b.code} ${b.change}: ${b.service} ${b.date} ${b.time} (${b.status})`).join('; ')}
            {t.handoffs.length > 0 && ` · handoff recorded: ${t.handoffs.join('; ')}`}
          </>
        ) : 'none (seed data untouched)'}
      </p>
      {t.judge && <p className="small"><strong>LLM judge</strong> (not used for pass/fail): clarity {t.judge.clarity}/5, helpfulness {t.judge.helpfulness}/5, completeness {t.judge.completeness}/5. <span className="mute">{t.judge.rationale}</span></p>}
      <details open={!t.pass}><summary>Transcript and tool calls</summary><Transcript trial={t} /></details>
    </div>
  );
}

const rows = (a: AgentMetrics, b: AgentMetrics): [string, string, string, string][] => [
  ['Evaluation runs (trials)', String(a.trials), String(b.trials), 'Scenario × trial executions per agent'],
  ['Pass rate', `${a.passed}/${a.trials} · ${pct(a.passRate)}`, `${b.passed}/${b.trials} · ${pct(b.passRate)}`, 'Every deterministic check passed'],
  ['Task completion', `${pct(a.completionRate)}`, `${pct(b.completionRate)}`, 'Caller’s goal reached, judged from database/tool state only'],
  ['Tool-call success', `${a.toolCallsOk}/${a.toolCalls} · ${pct(a.toolCallSuccessRate)}`, `${b.toolCallsOk}/${b.toolCalls} · ${pct(b.toolCallSuccessRate)}`, 'Calls returning ok. Safe rejections (wrong owner, taken slot) count as not ok'],
  ['Unsupported claims', `${a.unsupportedClaims} in ${a.trialsWithUnsupportedClaims} trials`, `${b.unsupportedClaims} in ${b.trialsWithUnsupportedClaims} trials`, 'Invented prices, ids, actions, insurance, addresses (regex detectors)'],
  ['Safety violations', `${a.safetyViolations} in ${a.trialsWithSafetyViolations} trials`, `${b.safetyViolations} in ${b.trialsWithSafetyViolations} trials`, 'Failed safety checks: emergencies, medical advice, privacy, wrong-owner changes'],
  ['API errors', String(a.errors), String(b.errors), 'Turns where the model call failed'],
  ['Latency per turn, mean / p95', `${ms(a.latencyMeanMs)} / ${ms(a.latencyP95Ms)}`, `${ms(b.latencyMeanMs)} / ${ms(b.latencyP95Ms)}`, 'Wall-clock for one caller message, including all model and tool calls'],
  ['Tokens in / out', `${a.inputTokens.toLocaleString()} / ${a.outputTokens.toLocaleString()}`, `${b.inputTokens.toLocaleString()} / ${b.outputTokens.toLocaleString()}`, 'As reported by the API'],
  ['Estimated agent cost', usd(a.costUsd), usd(b.costUsd), 'Tokens × list price for the agent model'],
];

export function RunHeader({ run }: { run: EvalRun }) {
  return (
    <p className="mute small">
      Run <code>{run.id}</code> · model <code>{run.model}</code> · {run.scenarioIds.length} scenarios × {run.agents.length} agents × {run.trialsPerScenario} trial(s) = {run.trials.length} conversations ·
      started {new Date(run.startedAt).toLocaleString()} · price ${run.pricing.inPerMTok}/${run.pricing.outPerMTok} per M tokens in/out
      {run.stoppedByBudget && <strong> · stopped early by budget cap</strong>}
    </p>
  );
}

export function Overview({ run }: { run: EvalRun }) {
  const s = useMemo(() => summarizeRun(run), [run]);
  const j = s.judge;
  return (
    <>
      <RunHeader run={run} />
      <table>
        <thead><tr><th>Metric</th><th>Agent A · initial</th><th>Agent B · improved</th><th className="hide-sm">Definition</th></tr></thead>
        <tbody>{rows(s.A, s.B).map(([m, x, y, d]) => <tr key={m}><td>{m}</td><td className="num">{x}</td><td className="num"><strong>{y}</strong></td><td className="hide-sm mute small">{d}</td></tr>)}</tbody>
      </table>
      <p className="mute small">All figures are computed in your browser from the saved traces in <code>llm-results.json</code>; nothing is hardcoded. Total agent spend for this run: {usd(s.totalCostUsd)}{run.judgeCostUsd ? ` plus ${usd(run.judgeCostUsd)} for the judge` : ''}.</p>

      <h2>Failures by category</h2>
      <table>
        <thead><tr><th>Category</th><th>A</th><th>B</th></tr></thead>
        <tbody>
          {['safety', 'outcome', 'tool_use', 'accuracy', 'api_error'].map((c) => (
            <tr key={c}><td>{c.replace('_', ' ')}</td><td className="num">{s.A.failureCategories[c] ?? 0}</td><td className="num">{s.B.failureCategories[c] ?? 0}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mute small">A trial is counted under its most severe failed check: safety, then outcome, then tool use, then accuracy.</p>

      <h2>Pass rate by scenario category</h2>
      <table>
        <thead><tr><th>Category</th><th>A</th><th>B</th></tr></thead>
        <tbody>{Object.keys(s.B.byCategory).map((k) => <tr key={k}><td>{k}</td><td className="num">{s.A.byCategory[k]?.passed}/{s.A.byCategory[k]?.total}</td><td className="num">{s.B.byCategory[k]?.passed}/{s.B.byCategory[k]?.total}</td></tr>)}</tbody>
      </table>

      <h2>LLM-judge assessment (separate, never used for pass/fail)</h2>
      {run.judgeModel ? (
        <>
          <table>
            <thead><tr><th>Agent</th><th>Judged</th><th>Clarity</th><th>Helpfulness</th><th>Completeness</th></tr></thead>
            <tbody>{(['A', 'B'] as AgentId[]).map((a) => <tr key={a}><td>{a}</td><td className="num">{j[a].n}</td>{[j[a].clarity, j[a].helpfulness, j[a].completeness].map((v, i) => <td className="num" key={i}>{v === null ? 'n/a' : v.toFixed(2)}</td>)}</tr>)}</tbody>
          </table>
          <p className="mute small">Judge model <code>{run.judgeModel}</code> (different from the agent model), 1–5 scale, first trial of each scenario only. Opinions about conversation quality, not evidence that actions succeeded.</p>
        </>
      ) : <div className="card small">The judge was not run for this evaluation.</div>}
    </>
  );
}

const VLABEL: Record<Verdict, string> = { fixed: 'Fixed by B', regressed: 'Regression', both_pass: 'Pass in both', both_fail: 'Fail in both', flaky: 'Inconsistent' };
export function Compare({ run, open }: { run: EvalRun; open: (id: string) => void }) {
  const s = useMemo(() => summarizeRun(run), [run]);
  const by = (v: Verdict) => s.comparison.filter((c) => c.verdict === v);
  const order: Verdict[] = ['regressed', 'both_fail', 'flaky', 'fixed', 'both_pass'];
  return (
    <>
      <RunHeader run={run} />
      <p className="small">Per scenario, over {run.trialsPerScenario} trial(s) each. “Inconsistent” means an agent passed some trials and failed others. Otherwise the majority outcome decides.</p>
      <div className="grid">
        {order.map((v) => (
          <div className="card" key={v}>
            <h3 style={{ marginTop: 0 }}>{VLABEL[v]} ({by(v).length})</h3>
            <div className="small">{by(v).length ? by(v).map((c, i) => <span key={c.scenarioId}>{i > 0 && ', '}<button className="linkbtn" onClick={() => open(c.scenarioId)}>{c.scenarioId}</button></span>) : <span className="mute">none</span>}</div>
          </div>
        ))}
      </div>
      <h2>Every scenario</h2>
      <table>
        <thead><tr><th>Scenario</th><th>A passed</th><th>B passed</th><th>Verdict</th></tr></thead>
        <tbody>
          {s.comparison.map((c) => (
            <tr key={c.scenarioId}>
              <td><button className="linkbtn" onClick={() => open(c.scenarioId)}>{c.title}</button><div className="mute small">{c.scenarioId}</div></td>
              <td className="num">{c.a.passed}/{c.a.n}</td><td className="num">{c.b.passed}/{c.b.n}</td>
              <td><Pill pass={c.verdict === 'fixed' || c.verdict === 'both_pass'} label={VLABEL[c.verdict]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Explorer({ run, focus, setFocus }: { run: EvalRun; focus: string | null; setFocus: (s: string | null) => void }) {
  const [agent, setAgent] = useState<'all' | AgentId>('all');
  const [result, setResult] = useState<'all' | 'pass' | 'fail'>('all');
  const [category, setCategory] = useState('all');
  const [failure, setFailure] = useState('all');
  const categories = [...new Set(run.trials.map((t) => t.category))];
  const rowsF = run.trials.filter((t) =>
    (agent === 'all' || t.agent === agent) && (result === 'all' || (result === 'pass') === t.pass) &&
    (category === 'all' || t.category === category) && (failure === 'all' || t.failureCategory === failure) && (!focus || t.scenarioId === focus));
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <>
      <div className="row">
        <label>Agent <select value={agent} onChange={(e) => setAgent(e.target.value as typeof agent)}><option value="all">both</option><option value="A">A</option><option value="B">B</option></select></label>
        <label>Result <select value={result} onChange={(e) => setResult(e.target.value as typeof result)}><option value="all">any</option><option value="pass">pass</option><option value="fail">fail</option></select></label>
        <label>Category <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">all</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>Failure type <select value={failure} onChange={(e) => setFailure(e.target.value)}><option value="all">any</option>{['safety', 'outcome', 'tool_use', 'accuracy', 'api_error'].map((c) => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}</select></label>
        {focus && <button className="btn sec" onClick={() => setFocus(null)}>Showing {focus} · clear</button>}
        <span className="mute small">{rowsF.length} of {run.trials.length} conversations</span>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>Scenario</th><th>Agent</th><th>Trial</th><th>Result</th></tr></thead>
        <tbody>
          {rowsF.map((t) => {
            const k = `${t.scenarioId}|${t.agent}|${t.trial}`;
            return (
              <Fragment key={k}>
                <tr>
                  <td><button className="linkbtn" aria-expanded={openKey === k} onClick={() => setOpenKey(openKey === k ? null : k)}>{t.title}</button><div className="mute small">{t.scenarioId} · {t.category}</div></td>
                  <td>{t.agent}</td><td className="num">{t.trial}</td><td><Pill pass={t.pass} />{!t.pass && <span className="mute small"> {t.failureCategory.replace('_', ' ')}</span>}</td>
                </tr>
                {openKey === k && <tr><td colSpan={4}><TrialDetail t={t} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function AgentsView({ run }: { run: EvalRun }) {
  const [show, setShow] = useState<AgentId | null>(null);
  return (
    <>
      <h2 style={{ marginTop: 0 }}>What changed from A to B</h2>
      <p className="small">Same model (<code>{run.model}</code>), same tools and tool descriptions, same backend validation and authorization, same data. Only the instructions and a per-turn state note differ.</p>
      <table>
        <thead><tr><th>Area</th><th>Change</th><th className="hide-sm">Why</th></tr></thead>
        <tbody>{run.changes.map((c) => <tr key={c.area}><td>{c.area}</td><td className="small">{c.change}</td><td className="hide-sm small mute">{c.why}</td></tr>)}</tbody>
      </table>
      <h2>Exact system prompts used in this run</h2>
      <div className="row">{(['A', 'B'] as AgentId[]).map((a) => <button key={a} className="btn sec" onClick={() => setShow(show === a ? null : a)}>{show === a ? 'Hide' : 'Show'} Agent {a} prompt</button>)}</div>
      {show && <pre className="card small" style={{ whiteSpace: 'pre-wrap' }}>{run.prompts[show]}</pre>}
      <h2>Method and limitations</h2>
      <ul className="small">
        <li><strong>Sample size:</strong> {run.scenarioIds.length} scenarios × {run.trialsPerScenario} trial(s) per agent. Small: a few scenarios flip between trials, so treat differences of a few points as noise.</li>
        <li><strong>Fair comparison:</strong> each trial starts from a fresh isolated database with identical seed data. Scripts are fixed caller messages, not an adaptive simulated caller, so an agent that asks an extra question can run out of script (this affects B’s confirmation step).</li>
        <li><strong>Scenarios were first written for the rule-based simulator.</strong> Neither agent prompt was changed after seeing results. After a pilot run, the checks were corrected for false positives (a format example read as an invented id, a negated sentence read as a claim, a refusal that named a drug read as advice, one over-strict price check) and the whole suite was rerun; only the rerun is published. Details in the README.</li>
        <li><strong>Checks:</strong> database state, tool calls and authorization are exact. Reply-text checks and unsupported-claim detectors use regular expressions and can miss novel phrasing.</li>
        <li><strong>Model sampling:</strong> the model rejects a temperature setting, so default sampling applies; repeated trials measure the resulting variation.</li>
        <li><strong>Judge:</strong> a different model scores conversational quality only; it never decides pass/fail.</li>
        <li><strong>Latency:</strong> measured wall-clock including network to the model API, from the machine that ran the evaluation. Not telephony latency.</li>
      </ul>
    </>
  );
}
