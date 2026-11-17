import { compareAgents, type AgentMetrics, type ScenarioComparison, type Verdict } from '../../llm/metrics';
import type { EvalRun } from '../../llm/types';

export interface ScenarioRow extends ScenarioComparison { a: ScenarioComparison['a'] & { results: boolean[] }; b: ScenarioComparison['b'] & { results: boolean[] }; failureTypes: string[]; }

/** One row per scenario with per-trial results for each agent. Pure function of the recorded run. */
export function scenarioRows(run: EvalRun): ScenarioRow[] {
  const results = (id: string, agent: 'A' | 'B') => run.trials.filter((t) => t.scenarioId === id && t.agent === agent).sort((x, y) => x.trial - y.trial).map((t) => t.pass);
  return compareAgents(run.trials).map((c) => ({
    ...c,
    a: { ...c.a, results: results(c.scenarioId, 'A') },
    b: { ...c.b, results: results(c.scenarioId, 'B') },
    failureTypes: [...new Set(run.trials.filter((t) => t.scenarioId === c.scenarioId && !t.pass).map((t) => t.failureCategory))],
  }));
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  fixed: 'B better', regressed: 'A better', both_pass: 'Same (pass)', both_fail: 'Same (fail)', flaky: 'Inconsistent',
};
export const verdictTone = (v: Verdict) => (v === 'fixed' || v === 'both_pass' ? 'pass' : v === 'flaky' ? 'warn' : 'fail') as 'pass' | 'warn' | 'fail';

/** Plain-language findings, generated from the data so they cannot drift from it. */
export function findings(run: EvalRun, a: AgentMetrics, b: AgentMetrics, rows: ScenarioRow[]): string[] {
  const out: string[] = [];
  out.push(`Across ${a.trials + b.trials} recorded conversations, Agent A passed ${a.passed} of ${a.trials} and Agent B passed ${b.passed} of ${b.trials}.`);
  const better = rows.filter((r) => r.verdict === 'fixed').map((r) => r.title);
  const worse = rows.filter((r) => r.verdict === 'regressed').map((r) => r.title);
  const flaky = rows.filter((r) => r.verdict === 'flaky').map((r) => r.title);
  const bothFail = rows.filter((r) => r.verdict === 'both_fail').map((r) => r.title);
  if (better.length) out.push(`Consistent difference in B’s favor: ${better.join('; ')}.`);
  if (worse.length) out.push(`Consistent difference in A’s favor: ${worse.join('; ')}.`);
  if (bothFail.length) out.push(`Failed by both agents: ${bothFail.join('; ')}.`);
  if (flaky.length) out.push(`Inconsistent across trials (passed some, failed others): ${flaky.join('; ')}.`);
  if (!better.length && !worse.length && !bothFail.length && !flaky.length) out.push('No scenario differed between the agents.');
  const claims = a.unsupportedClaims + b.unsupportedClaims; const safety = a.safetyViolations + b.safetyViolations;
  out.push(claims + safety === 0
    ? 'Neither agent made an unsupported claim or a safety violation in any trial.'
    : `Unsupported claims: A ${a.unsupportedClaims}, B ${b.unsupportedClaims}. Safety violations: A ${a.safetyViolations}, B ${b.safetyViolations}.`);
  const gap = Math.abs(b.passed - a.passed);
  out.push(`The overall gap is ${gap} conversation${gap === 1 ? '' : 's'} out of ${a.trials} per agent with ${run.trialsPerScenario} trial${run.trialsPerScenario === 1 ? '' : 's'} per scenario, so treat small differences as noise and look at the scenarios below.`);
  return out;
}
