import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarizeRun } from '../src/llm/metrics';
import type { EvalRun } from '../src/llm/types';
import { findings, scenarioRows } from '../src/ui/app/selectors';
import { parseHash, href } from '../src/ui/app/router';

const run: EvalRun = JSON.parse(readFileSync('public/llm-results.json', 'utf8'));

describe('dashboard selectors', () => {
  const rows = scenarioRows(run);
  it('yields one row per scenario with one result per trial per agent', () => {
    expect(rows.length).toBe(run.scenarioIds.length);
    for (const r of rows) { expect(r.a.results.length).toBe(run.trialsPerScenario); expect(r.b.results.length).toBe(run.trialsPerScenario); }
  });
  it('row pass counts match the recorded trials', () => {
    for (const r of rows) {
      expect(r.a.passed).toBe(run.trials.filter((t) => t.scenarioId === r.scenarioId && t.agent === 'A' && t.pass).length);
      expect(r.a.results.filter(Boolean).length).toBe(r.a.passed);
    }
  });
  it('findings quote the real totals and name every non-identical scenario', () => {
    const s = summarizeRun(run); const text = findings(run, s.A, s.B, rows).join(' ');
    expect(text).toContain(`Agent A passed ${s.A.passed} of ${s.A.trials}`);
    expect(text).toContain(`Agent B passed ${s.B.passed} of ${s.B.trials}`);
    for (const r of rows.filter((x) => x.verdict !== 'both_pass')) expect(text).toContain(r.title);
  });
});

describe('hash router', () => {
  it('round-trips and falls back to overview', () => {
    expect(parseHash('#/scenarios/emergency')).toEqual({ section: 'scenarios', param: 'emergency' });
    expect(parseHash('')).toEqual({ section: 'overview' });
    expect(parseHash('#/nope')).toEqual({ section: 'overview' });
    expect(href({ section: 'scenarios', param: 'a b' })).toBe('#/scenarios/a%20b');
    expect(parseHash(href({ section: 'scenarios', param: 'a b' })).param).toBe('a b');
  });
});
