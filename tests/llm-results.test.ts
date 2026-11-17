import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agentMetrics, summarizeRun } from '../src/llm/metrics';
import type { EvalRun } from '../src/llm/types';
import { PROMPTS } from '../server/prompts';
import { LLM_SCENARIOS } from '../server/eval/scenarios';

const run: EvalRun = JSON.parse(readFileSync('public/llm-results.json', 'utf8'));

describe('published LLM evaluation results (public/llm-results.json)', () => {
  it('has one recorded conversation per scenario × agent × trial', () => {
    expect(run.trials.length).toBe(run.scenarioIds.length * run.agents.length * run.trialsPerScenario);
    expect(run.scenarioIds.length).toBe(LLM_SCENARIOS.length);
    const keys = new Set(run.trials.map((t) => `${t.scenarioId}|${t.agent}|${t.trial}`));
    expect(keys.size).toBe(run.trials.length);
  });
  it('was produced by the prompts currently in the repo', () => {
    expect(run.prompts.A).toBe(PROMPTS.A);
    expect(run.prompts.B).toBe(PROMPTS.B);
  });
  it('every pass flag is consistent with its recorded checks and errors', () => {
    for (const t of run.trials) {
      const hadError = t.turns.some((x) => x.error);
      expect(t.pass).toBe(!hadError && t.checks.every((c) => c.pass));
      expect(t.failureCategory === 'none').toBe(t.pass);
    }
  });
  it('dashboard metrics equal numbers recomputed directly from the traces', () => {
    const s = summarizeRun(run);
    for (const ag of ['A', 'B'] as const) {
      const ts = run.trials.filter((t) => t.agent === ag);
      expect(s[ag].passed).toBe(ts.filter((t) => t.pass).length);
      expect(s[ag].toolCalls).toBe(ts.flatMap((t) => t.turns.flatMap((x) => x.toolCalls)).length);
      expect(s[ag].costUsd).toBeCloseTo(ts.reduce((n, t) => n + t.turns.reduce((m, x) => m + x.costUsd, 0), 0), 10);
      expect(s[ag]).toEqual(agentMetrics(ts));
    }
  });
  it('cost matches tokens × recorded price', () => {
    for (const t of run.trials) for (const x of t.turns)
      expect(x.costUsd).toBeCloseTo((x.inputTokens * run.pricing.inPerMTok + x.outputTokens * run.pricing.outPerMTok) / 1e6, 9);
  });
  it('contains no credentials', () => expect(JSON.stringify(run)).not.toMatch(/sk-ant-|x-api-key/i));
  it('records the database effects: every create_booking success appears as a created booking', () => {
    for (const t of run.trials) {
      const made = new Set(t.turns.flatMap((x) => x.toolCalls).filter((c) => c.name === 'create_booking' && c.result.ok).map((c) => c.result.confirmation_code));
      for (const code of made) expect(t.finalBookings.some((b) => b.code === code)).toBe(true);
    }
  });
});
