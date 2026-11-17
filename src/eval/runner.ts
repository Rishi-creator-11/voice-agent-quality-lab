import { Agent } from '../core/agent';
import { CONFIGS } from '../core/configs';
import { Sandbox } from '../core/tools';
import type { AgentConfig, ToolCall, Turn } from '../core/types';
import { detectIncidents } from './detectors';
import { SCENARIOS } from './scenarios';
import type { Metrics, Scenario, ScenarioResult } from './types';

function summarizeActual(turnCalls: ToolCall[][], last: string, newIds: string): string {
  const tools = turnCalls.flat().map((c) => `${c.name}${c.result.ok ? '' : '✗'}`);
  return `Tools: ${tools.length ? tools.join(' → ') : 'none'}. ${newIds}Final reply: "${last.length > 170 ? last.slice(0, 170) + '…' : last}"`;
}

export function runScenario(sc: Scenario, cfg: AgentConfig): ScenarioResult {
  const sandbox = new Sandbox();
  const agent = new Agent(cfg, sandbox);
  const transcript: Turn[] = []; const replies: string[] = []; const turnCalls: ToolCall[][] = []; const lat: number[] = [];
  for (const u of sc.turns) {
    transcript.push({ role: 'user', text: u });
    const r = agent.respond(u);
    transcript.push({ role: 'agent', text: r.reply, ms: r.ms, toolCalls: r.toolCalls });
    replies.push(r.reply); turnCalls.push(r.toolCalls); lat.push(r.ms);
  }
  const incidents = detectIncidents(sc.turns, replies, turnCalls);
  const ctx = { userTurns: sc.turns, replies, turnCalls, calls: turnCalls.flat(), sandbox, state: agent.state, incidents };
  const checks = sc.checks.map((c) => ({ name: c.name, kind: c.kind, ...c.run(ctx) }));
  const created = sandbox.bookings.filter((b) => Number(b.id.slice(3)) > 1005);
  const changed = created.length ? `Created ${created.map((b) => `${b.id} (${b.date} ${b.time})`).join(', ')}. ` : '';
  return {
    scenarioId: sc.id, title: sc.title, category: sc.category, configId: cfg.id, expected: sc.expected,
    actual: summarizeActual(turnCalls, replies[replies.length - 1], changed),
    pass: checks.every((c) => c.pass),
    goalReached: checks.filter((c) => c.kind === 'outcome').every((c) => c.pass),
    checks, incidents, transcript, latenciesMs: lat,
  };
}

export const runSuite = (cfg: AgentConfig, scenarios = SCENARIOS) => scenarios.map((s) => runScenario(s, cfg));

export function computeMetrics(results: ScenarioResult[]): Metrics {
  const calls = results.flatMap((r) => r.transcript.flatMap((t) => t.toolCalls ?? []));
  const toolChecks = results.flatMap((r) => r.checks.filter((c) => c.kind === 'tool'));
  const lat = results.flatMap((r) => r.latenciesMs).sort((a, b) => a - b);
  const byCategory: Metrics['byCategory'] = {};
  for (const r of results) { const c = (byCategory[r.category] ??= { passed: 0, total: 0 }); c.total++; if (r.pass) c.passed++; }
  const ratio = (n: number, d: number) => (d ? n / d : null);
  const passed = results.filter((r) => r.pass).length; const goals = results.filter((r) => r.goalReached).length;
  return {
    scenarios: results.length, passed, passRate: passed / results.length,
    goalReached: goals, completionRate: goals / results.length,
    toolCalls: calls.length, toolCallsOk: calls.filter((c) => c.result.ok).length,
    toolCallSuccessRate: ratio(calls.filter((c) => c.result.ok).length, calls.length),
    toolChecks: toolChecks.length, toolChecksPassed: toolChecks.filter((c) => c.pass).length,
    toolCheckPassRate: ratio(toolChecks.filter((c) => c.pass).length, toolChecks.length),
    incidents: results.reduce((n, r) => n + r.incidents.length, 0),
    scenariosWithIncidents: results.filter((r) => r.incidents.length).length,
    latencyMeanMs: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
    latencyP95Ms: lat.length ? lat[Math.min(lat.length - 1, Math.ceil(lat.length * 0.95) - 1)] : 0,
    turnsMeasured: lat.length, byCategory,
  };
}

export interface Comparison { fixed: string[]; remaining: string[]; regressions: string[]; stillPassing: string[]; }
export function compare(a: ScenarioResult[], b: ScenarioResult[]): Comparison {
  const bm = new Map(b.map((r) => [r.scenarioId, r]));
  const out: Comparison = { fixed: [], remaining: [], regressions: [], stillPassing: [] };
  for (const ra of a) {
    const rb = bm.get(ra.scenarioId)!;
    if (!ra.pass && rb.pass) out.fixed.push(ra.scenarioId);
    else if (!ra.pass && !rb.pass) out.remaining.push(ra.scenarioId);
    else if (ra.pass && !rb.pass) out.regressions.push(ra.scenarioId);
    else out.stillPassing.push(ra.scenarioId);
  }
  return out;
}

export function runBoth() {
  const a = runSuite(CONFIGS.A); const b = runSuite(CONFIGS.B);
  return { A: a, B: b, metricsA: computeMetrics(a), metricsB: computeMetrics(b), comparison: compare(a, b) };
}
