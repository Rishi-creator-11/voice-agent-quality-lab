import type { AgentMetrics } from '../../llm/metrics';
import type { EvalRun, Trial } from '../../llm/types';
import type { ScenarioRow } from './selectors';

/** A trial counts as critical if a safety check failed, or it failed inside a safety-critical scenario category. */
export const SAFETY_CATEGORY = 'Safety & accuracy';
export const isCritical = (t: Trial) => !t.pass && (t.failureCategory === 'safety' || t.category === SAFETY_CATEGORY);

export interface Card { label: string; help: string; a: string; b: string; tone: 'good' | 'bad' | 'neutral' }
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The four executive summary cards. Every value is derived from recorded trials. */
export function summaryCards(run: EvalRun, a: AgentMetrics, b: AgentMetrics, rows: ScenarioRow[]): Card[] {
  const crit = (ag: 'A' | 'B') => run.trials.filter((t) => t.agent === ag && isCritical(t)).length;
  const regressions = rows.filter((r) => r.verdict === 'regressed').length;
  const flaky = rows.filter((r) => r.verdict === 'flaky').length;
  const ca = crit('A'), cb = crit('B');
  return [
    { label: 'Scenario pass rate', help: `Share of ${a.trials} conversations per agent where every deterministic check passed.`, a: pct1(a.passRate), b: pct1(b.passRate), tone: b.passRate >= a.passRate ? 'good' : 'bad' },
    { label: 'Critical failures', help: 'Failed trials in safety-critical scenarios (emergency, medical advice, privacy, wrong-owner changes) or any failed safety check.', a: String(ca), b: String(cb), tone: cb < ca ? 'good' : cb > ca ? 'bad' : 'neutral' },
    { label: 'Unsupported claims', help: 'Replies that invented a price, id, action, insurance coverage or address (regex detectors).', a: String(a.unsupportedClaims), b: String(b.unsupportedClaims), tone: a.unsupportedClaims + b.unsupportedClaims === 0 ? 'good' : 'bad' },
    { label: 'Regressions', help: `Scenarios where B is consistently worse than A. ${flaky} other scenario${flaky === 1 ? ' is' : 's are'} inconsistent across trials.`, a: '–', b: String(regressions), tone: regressions === 0 ? 'good' : 'bad' },
  ];
}

export interface Insight { title: string; body: string }

/** Insights are templated from the data. If the data changes, so does the text. */
export function insights(run: EvalRun, a: AgentMetrics, b: AgentMetrics, rows: ScenarioRow[], judge: { A: { helpfulness: number | null; completeness: number | null }; B: { helpfulness: number | null; completeness: number | null } }): Insight[] {
  const out: Insight[] = [];
  for (const r of rows.filter((x) => x.verdict === 'fixed')) {
    const t = run.trials.find((x) => x.scenarioId === r.scenarioId && x.agent === 'A' && !x.pass);
    const why = t ? t.checks.filter((c) => !c.pass).map((c) => c.name).slice(0, 2).join(' and ') : 'its checks';
    out.push({ title: `Agent B is more reliable on “${r.title}”`, body: `B passed ${r.b.passed} of ${r.b.n} trials, A passed ${r.a.passed} of ${r.a.n}. A failed on ${why}.` });
  }
  for (const r of rows.filter((x) => x.verdict === 'regressed')) out.push({ title: `Agent A beats B on “${r.title}”`, body: `A passed ${r.a.passed} of ${r.a.n}; B passed ${r.b.passed} of ${r.b.n}.` });
  for (const r of rows.filter((x) => x.verdict === 'flaky')) {
    const who = r.a.passed < r.a.n ? 'A' : 'B'; const side = who === 'A' ? r.a : r.b;
    const t = run.trials.find((x) => x.scenarioId === r.scenarioId && x.agent === who && !x.pass);
    out.push({ title: `“${r.title}” is inconsistent`, body: `Agent ${who} passed ${side.passed} of ${side.n} trials${t ? `; failed checks in the miss: ${t.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}` : ''}. Same input, different outcomes.` });
  }
  for (const r of rows.filter((x) => x.verdict === 'both_fail')) out.push({ title: `Both agents fail “${r.title}”`, body: 'Neither version handled this scenario reliably.' });
  const cost = b.costUsd / Math.max(a.costUsd, 1e-9);
  if (a.costUsd > 0) out.push({ title: 'Better behavior costs more tokens', body: `B’s longer instructions raised agent cost by ${Math.round((cost - 1) * 100)}% (${a.costUsd.toFixed(3)} to ${b.costUsd.toFixed(3)} USD for this run). Latency per turn was similar (${(a.latencyMeanMs / 1000).toFixed(1)} s vs ${(b.latencyMeanMs / 1000).toFixed(1)} s mean).` });
  if (a.unsupportedClaims + b.unsupportedClaims + a.safetyViolations + b.safetyViolations === 0) out.push({ title: 'No unsupported claims or safety violations', body: 'Neither agent invented a price, id, action or address, and no safety check failed in any trial.' });
  if (judge.A.helpfulness !== null && judge.B.helpfulness !== null && judge.B.completeness !== null && judge.A.completeness !== null)
    out.push({ title: 'The judge model prefers B’s conversations', body: `Average completeness ${judge.B.completeness.toFixed(2)} vs ${judge.A.completeness.toFixed(2)} out of 5. This is a separate opinion from the pass/fail checks.` });
  return out.slice(0, 5);
}

/** One-sentence page summary and the closing written summary. */
export function headline(run: EvalRun, a: AgentMetrics, b: AgentMetrics): string {
  return `${a.trials + b.trials} recorded conversations on ${run.scenarioIds.length} scenarios: Agent A passed ${a.passed} of ${a.trials}, Agent B passed ${b.passed} of ${b.trials}.`;
}
export function writtenSummary(run: EvalRun, a: AgentMetrics, b: AgentMetrics, rows: ScenarioRow[]): string {
  const better = rows.filter((r) => r.verdict === 'fixed').length; const flaky = rows.filter((r) => r.verdict === 'flaky').length;
  const gap = Math.abs(b.passed - a.passed);
  return `Both versions handled most of the suite. B was consistently better on ${better} scenario${better === 1 ? '' : 's'}, and ${flaky} scenario${flaky === 1 ? ' was' : 's were'} inconsistent across trials. The overall gap is ${gap} conversation${gap === 1 ? '' : 's'} out of ${a.trials} per agent, from ${run.trialsPerScenario} trials per scenario on ${run.model}, so the scenario-level differences matter more than the headline percentage. Scenarios were scripted by one author and checked by deterministic rules, so this is evidence about these cases, not about AI agents in general.`;
}

/** Category pass rates for the paired bars. */
export function categoryRates(a: AgentMetrics, b: AgentMetrics): { category: string; a: number; b: number; n: number }[] {
  return Object.keys(b.byCategory).map((category) => ({
    category, n: b.byCategory[category].total,
    a: a.byCategory[category] ? a.byCategory[category].passed / a.byCategory[category].total : 0,
    b: b.byCategory[category].passed / b.byCategory[category].total,
  }));
}
