import type { AgentId, EvalRun, Trial } from './types';

export interface AgentMetrics {
  trials: number; passed: number; passRate: number; goalReached: number; completionRate: number;
  toolCalls: number; toolCallsOk: number; toolCallSuccessRate: number | null;
  toolChecks: number; toolChecksPassed: number;
  unsupportedClaims: number; trialsWithUnsupportedClaims: number;
  safetyViolations: number; trialsWithSafetyViolations: number;
  errors: number;
  latencyMeanMs: number; latencyP95Ms: number; turns: number;
  inputTokens: number; outputTokens: number; costUsd: number;
  failureCategories: Record<string, number>;
  byCategory: Record<string, { passed: number; total: number }>;
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const p95 = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] : 0; };

export function agentMetrics(trials: Trial[]): AgentMetrics {
  const calls = trials.flatMap((t) => t.turns.flatMap((x) => x.toolCalls));
  const checks = trials.flatMap((t) => t.checks);
  const toolChecks = checks.filter((c) => c.kind === 'tool');
  const turns = trials.flatMap((t) => t.turns);
  const isClaim = (i: { type: string }) => i.type !== 'medical_advice';
  const failureCategories: Record<string, number> = {}; const byCategory: AgentMetrics['byCategory'] = {};
  for (const t of trials) {
    if (!t.pass) failureCategories[t.failureCategory] = (failureCategories[t.failureCategory] ?? 0) + 1;
    const c = (byCategory[t.category] ??= { passed: 0, total: 0 }); c.total++; if (t.pass) c.passed++;
  }
  const safetyFails = (t: Trial) => t.checks.filter((c) => c.kind === 'safety' && !c.pass).length;
  const passed = trials.filter((t) => t.pass).length; const goals = trials.filter((t) => t.goalReached).length;
  return {
    trials: trials.length, passed, passRate: trials.length ? passed / trials.length : 0,
    goalReached: goals, completionRate: trials.length ? goals / trials.length : 0,
    toolCalls: calls.length, toolCallsOk: calls.filter((c) => c.result.ok).length,
    toolCallSuccessRate: calls.length ? calls.filter((c) => c.result.ok).length / calls.length : null,
    toolChecks: toolChecks.length, toolChecksPassed: toolChecks.filter((c) => c.pass).length,
    unsupportedClaims: trials.reduce((n, t) => n + t.incidents.filter(isClaim).length, 0),
    trialsWithUnsupportedClaims: trials.filter((t) => t.incidents.some(isClaim)).length,
    safetyViolations: trials.reduce((n, t) => n + safetyFails(t), 0),
    trialsWithSafetyViolations: trials.filter((t) => safetyFails(t) > 0).length,
    errors: turns.filter((x) => x.error).length,
    latencyMeanMs: mean(turns.map((x) => x.totalMs)), latencyP95Ms: p95(turns.map((x) => x.totalMs)), turns: turns.length,
    inputTokens: turns.reduce((n, x) => n + x.inputTokens, 0), outputTokens: turns.reduce((n, x) => n + x.outputTokens, 0),
    costUsd: turns.reduce((n, x) => n + x.costUsd, 0), failureCategories, byCategory,
  };
}

export type Verdict = 'fixed' | 'regressed' | 'both_pass' | 'both_fail' | 'flaky';
export interface ScenarioComparison { scenarioId: string; title: string; category: string; a: { passed: number; n: number }; b: { passed: number; n: number }; verdict: Verdict; }

/** Per scenario: majority pass over trials. 'flaky' = either agent passed some but not all trials. */
export function compareAgents(trials: Trial[]): ScenarioComparison[] {
  const ids = [...new Set(trials.map((t) => t.scenarioId))];
  return ids.map((id) => {
    const tally = (ag: AgentId) => { const ts = trials.filter((t) => t.scenarioId === id && t.agent === ag); return { passed: ts.filter((t) => t.pass).length, n: ts.length }; };
    const a = tally('A'), b = tally('B'); const any = trials.find((t) => t.scenarioId === id)!;
    const flaky = (x: { passed: number; n: number }) => x.passed > 0 && x.passed < x.n;
    const maj = (x: { passed: number; n: number }) => x.n > 0 && x.passed * 2 > x.n;
    const verdict: Verdict = flaky(a) || flaky(b) ? 'flaky' : maj(a) && maj(b) ? 'both_pass' : !maj(a) && !maj(b) ? 'both_fail' : maj(b) ? 'fixed' : 'regressed';
    return { scenarioId: id, title: any.title, category: any.category, a, b, verdict };
  });
}

export function summarizeRun(run: EvalRun) {
  const of = (ag: AgentId) => run.trials.filter((t) => t.agent === ag);
  const judged = (ag: AgentId) => of(ag).filter((t) => t.judge);
  const judgeAvg = (ag: AgentId, k: 'clarity' | 'helpfulness' | 'completeness') => { const j = judged(ag); return j.length ? mean(j.map((t) => t.judge![k])) : null; };
  return {
    A: agentMetrics(of('A')), B: agentMetrics(of('B')), comparison: compareAgents(run.trials),
    judge: { A: { n: judged('A').length, clarity: judgeAvg('A', 'clarity'), helpfulness: judgeAvg('A', 'helpfulness'), completeness: judgeAvg('A', 'completeness') },
             B: { n: judged('B').length, clarity: judgeAvg('B', 'clarity'), helpfulness: judgeAvg('B', 'helpfulness'), completeness: judgeAvg('B', 'completeness') } },
    totalCostUsd: of('A').concat(of('B')).reduce((n, t) => n + t.turns.reduce((m, x) => m + x.costUsd, 0), 0),
  };
}
