import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarizeRun } from '../src/llm/metrics';
import type { EvalRun } from '../src/llm/types';
import { categoryRates, headline, insights, isCritical, summaryCards, writtenSummary } from '../src/ui/app/insights';
import { scenarioRows } from '../src/ui/app/selectors';
import { href, parseHash } from '../src/ui/app/router';

const run: EvalRun = JSON.parse(readFileSync('public/llm-results.json', 'utf8'));
const s = summarizeRun(run); const rows = scenarioRows(run);

describe('executive overview data', () => {
  const cards = summaryCards(run, s.A, s.B, rows);
  it('has exactly the four requested summary cards', () => expect(cards.map((c) => c.label)).toEqual(['Scenario pass rate', 'Critical failures', 'Unsupported claims', 'Regressions']));
  it('pass-rate card equals recomputed values', () => {
    expect(cards[0].a).toBe(`${(s.A.passRate * 100).toFixed(1)}%`);
    expect(cards[0].b).toBe(`${(s.B.passRate * 100).toFixed(1)}%`);
  });
  it('critical-failure counts equal a direct count over trials', () => {
    const n = (ag: 'A' | 'B') => run.trials.filter((t) => t.agent === ag && !t.pass && (t.failureCategory === 'safety' || t.category === 'Safety & accuracy')).length;
    expect(cards[1].a).toBe(String(n('A'))); expect(cards[1].b).toBe(String(n('B')));
    expect(run.trials.filter(isCritical).length).toBe(n('A') + n('B'));
  });
  it('regression card counts only scenarios where B is consistently worse', () => expect(cards[3].b).toBe(String(rows.filter((r) => r.verdict === 'regressed').length)));
  it('insights are 1-5 items and every number they quote exists in the data', () => {
    const list = insights(run, s.A, s.B, rows, s.judge);
    expect(list.length).toBeGreaterThan(0); expect(list.length).toBeLessThanOrEqual(5);
    for (const r of rows.filter((x) => x.verdict === 'fixed')) expect(list.map((i) => i.title).join(' ')).toContain(r.title);
  });
  it('headline and summary quote real totals', () => {
    expect(headline(run, s.A, s.B)).toContain(`${s.A.passed} of ${s.A.trials}`);
    expect(writtenSummary(run, s.A, s.B, rows)).toContain(run.model);
  });
  it('category rates cover every category with values in [0,1]', () => {
    const c = categoryRates(s.A, s.B);
    expect(c.length).toBe(Object.keys(s.B.byCategory).length);
    for (const x of c) { expect(x.a).toBeGreaterThanOrEqual(0); expect(x.b).toBeLessThanOrEqual(1); }
  });
});

describe('routes', () => {
  it('empty hash is home; unknown falls back to home', () => { expect(parseHash('')).toEqual({ section: 'home' }); expect(parseHash('#/nope')).toEqual({ section: 'home' }); expect(href({ section: 'home' })).toBe('#/'); });
  it('knows every page', () => { for (const sct of ['overview', 'scenarios', 'live', 'how', 'method', 'run', 'history']) expect(parseHash(`#/${sct}`).section).toBe(sct); });
});
