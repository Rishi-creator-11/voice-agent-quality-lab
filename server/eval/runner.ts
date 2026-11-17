import { Conversation } from '../agent';
import type { BookingRow } from '../db';
import { SEED_BOOKINGS } from '../../src/core/clinic';
import { detectIncidents, LLM_NAMES } from '../../src/eval/detectors';
import { AGENT_CHANGES, PROMPTS } from '../prompts';
import { MODEL, PRICE, type LlmClient } from '../llm';
import type { AgentId, EvalRun, FinalBooking, Trial, TraceTurn } from '../../src/llm/types';
import { JUDGE_MODEL, judgeTranscript } from './judge';
import { LLM_SCENARIOS, type LlmScenario } from './scenarios';

function finalBookings(rows: BookingRow[]): FinalBooking[] {
  return rows.map((b) => {
    const seed = SEED_BOOKINGS.find((s) => s.id === b.code);
    const change: FinalBooking['change'] = !seed ? 'created' : seed.status !== b.status || seed.date !== b.date || seed.time !== b.time ? 'modified' : 'seed';
    return { code: b.code, name: b.full_name, service: b.service, date: b.date, time: b.time, status: b.status, change };
  });
}

export async function runTrial(sc: LlmScenario, agent: AgentId, trial: number, client: LlmClient): Promise<Trial> {
  const conv = new Conversation(agent, client); // fresh isolated DB per trial
  const turns: TraceTurn[] = [];
  for (const user of sc.turns) {
    const r = await conv.send(user);
    turns.push({ user, reply: r.reply, toolCalls: r.toolCalls.map((t) => ({ name: t.name, input: t.input, result: t.result, ms: t.ms })), inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, llmCalls: r.usage.llmCalls, costUsd: r.usage.costUsd, totalMs: r.totalMs, error: r.error });
    if (r.error) break;
  }
  const replies = turns.map((t) => t.reply);
  const incidents = detectIncidents(sc.turns, replies, turns.map((t) => t.toolCalls), LLM_NAMES);
  const ctx = { replies, calls: turns.flatMap((t) => t.toolCalls), bookings: conv.bookings(), handoffs: conv.handoffs(), incidents };
  const checks = sc.checks.map((c) => ({ name: c.name, kind: c.kind, ...c.run(ctx) }));
  const failed = checks.filter((c) => !c.pass);
  const hadError = turns.some((t) => t.error);
  const cat = (k: string) => failed.some((c) => c.kind === k);
  return {
    scenarioId: sc.id, title: sc.title, category: sc.category, expected: sc.expected, agent, trial, turns, checks, incidents,
    finalBookings: finalBookings(ctx.bookings), handoffs: ctx.handoffs,
    pass: !hadError && failed.length === 0, goalReached: !hadError && checks.filter((c) => c.kind === 'outcome').every((c) => c.pass),
    failureCategory: hadError ? 'api_error' : !failed.length ? 'none' : cat('safety') ? 'safety' : cat('outcome') ? 'outcome' : cat('tool') ? 'tool_use' : 'accuracy',
  };
}

export interface EvalOptions {
  scenarioIds?: string[]; agents?: AgentId[]; trials?: number; judge?: boolean; budgetUsd?: number; concurrency?: number;
  onProgress?: (done: number, total: number, last?: Trial) => void; shouldCancel?: () => boolean;
}

/** Runs every (scenario, agent, trial) from a clean state. Stops scheduling new trials once the budget is spent. */
export async function runEval(client: LlmClient, o: EvalOptions = {}): Promise<EvalRun> {
  const scenarios = LLM_SCENARIOS.filter((s) => !o.scenarioIds || o.scenarioIds.includes(s.id));
  const agents = o.agents ?? (['A', 'B'] as AgentId[]); const nTrials = o.trials ?? 1;
  const jobs: { sc: LlmScenario; agent: AgentId; trial: number }[] = [];
  for (let t = 1; t <= nTrials; t++) for (const sc of scenarios) for (const agent of agents) jobs.push({ sc, agent, trial: t });
  const startedAt = new Date().toISOString(); const trials: Trial[] = [];
  let spent = 0, judgeSpent = 0, next = 0, done = 0, stopped = false;
  const worker = async () => {
    while (next < jobs.length) {
      if (o.shouldCancel?.() || (o.budgetUsd !== undefined && spent + judgeSpent >= o.budgetUsd)) { stopped = true; return; }
      const j = jobs[next++];
      const tr = await runTrial(j.sc, j.agent, j.trial, client);
      spent += tr.turns.reduce((n, t) => n + t.costUsd, 0);
      if (o.judge && j.trial === 1 && !tr.turns.some((t) => t.error)) {
        try { const r = await judgeTranscript(client, j.sc.expected, tr.turns); tr.judge = r.judge; judgeSpent += r.costUsd; }
        catch (e) { tr.judgeError = (e as Error).message; }
      }
      trials.push(tr); o.onProgress?.(++done, jobs.length, tr);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  trials.sort((a, b) => a.trial - b.trial || scenarios.findIndex((s) => s.id === a.scenarioId) - scenarios.findIndex((s) => s.id === b.scenarioId) || a.agent.localeCompare(b.agent));
  return {
    id: `run-${startedAt.replace(/[:.]/g, '-')}`, startedAt, finishedAt: new Date().toISOString(), model: MODEL, judgeModel: o.judge ? JUDGE_MODEL : null,
    trialsPerScenario: nTrials, scenarioIds: scenarios.map((s) => s.id), agents, prompts: { A: PROMPTS.A, B: PROMPTS.B }, changes: AGENT_CHANGES,
    pricing: PRICE, budgetUsd: o.budgetUsd ?? null, stoppedByBudget: stopped, trials, judgeCostUsd: judgeSpent,
  };
}
