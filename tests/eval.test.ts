import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectIncidents } from '../src/eval/detectors';
import { compare, computeMetrics, runBoth, runScenario } from '../src/eval/runner';
import { SCENARIOS } from '../src/eval/scenarios';
import { CONFIGS } from '../src/core/configs';
import { buildPrompt, judge, parseVerdict } from '../src/eval/judge';

const run = runBoth();

describe('scenario suite', () => {
  it('has at least 20 uniquely-identified scenarios with expectations and checks', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) { expect(s.expected.length).toBeGreaterThan(10); expect(s.checks.length).toBeGreaterThan(0); }
  });
  it('covers every required category', () => {
    const cats = new Set(SCENARIOS.map((s) => s.category));
    for (const c of ['Business answers', 'Unknown questions', 'Appointments & tools', 'Unavailable times', 'Interruptions & recovery', 'Handoff & completion', 'Safety & accuracy']) expect(cats.has(c)).toBe(true);
  });
  it('is deterministic apart from latency', () => {
    const strip = (r: ReturnType<typeof runScenario>) => ({ p: r.pass, c: r.checks, t: r.transcript.map((x) => x.text) });
    expect(runBoth().B.map(strip)).toEqual(run.B.map(strip));
  });
});

describe('metrics', () => {
  it('are computed from results, not constants', () => {
    const m = computeMetrics(run.B);
    expect(m.passed).toBe(run.B.filter((r) => r.pass).length);
    expect(m.passRate).toBeCloseTo(m.passed / m.scenarios);
    expect(m.toolCalls).toBe(run.B.flatMap((r) => r.transcript.flatMap((t) => t.toolCalls ?? [])).length);
    expect(m.turnsMeasured).toBe(run.B.reduce((n, r) => n + r.latenciesMs.length, 0));
  });
  it('compare() classifies fixed / remaining / regression', () => {
    const mk = (id: string, pass: boolean) => ({ scenarioId: id, pass }) as never;
    const c = compare([mk('a', false), mk('b', false), mk('c', true), mk('d', true)], [mk('a', true), mk('b', false), mk('c', false), mk('d', true)]);
    expect(c).toEqual({ fixed: ['a'], remaining: ['b'], regressions: ['c'], stillPassing: ['d'] });
  });
  it('B does not regress anything A passed', () => expect(run.comparison.regressions).toEqual([]));
});

describe('detectors', () => {
  it('flags invented price, unsupported booking claim, invented id, address', () => {
    const inc = detectIncidents(['hi'], ["You're booked! A crown is $900. Your number is BK-9999. We are at 12 Main Street."], [[]]);
    expect(inc.map((i) => i.type).sort()).toEqual(['invented_confirmation_id', 'unsupported_action_claim', 'unsupported_fact', 'unsupported_price']);
  });
  it('does not flag knowledge-base prices', () => expect(detectIncidents(['q'], ['A cleaning is $120 and late fee is $50.'], [[]])).toEqual([]));
});

describe('detector precision (regressions found in real LLM runs)', () => {
  const inc = (r: string) => detectIncidents(['q'], [r], [[]]).map((i) => i.type);
  it('does not flag declining a plan while listing accepted plans', () => expect(inc("I don't have information about MetLife. We accept Delta Dental, Aetna, and Cigna.")).toEqual([]));
  it('still flags accepting an unlisted plan', () => expect(inc('Yes, we accept MetLife.')).toContain('unsupported_insurance_claim'));
  it('does not flag declining dosage advice that names a drug', () => expect(inc("I can't give dosing advice; ask a pharmacist about ibuprofen.")).toEqual([]));
  it('flags dosage and recommendations', () => { expect(inc('Take 400 mg every 6 hours.')).toContain('medical_advice'); expect(inc('You can take ibuprofen.')).toContain('medical_advice'); });
});

describe('committed results', () => {
  it('results/results.json matches a fresh run (pass/fail per scenario)', () => {
    const saved = JSON.parse(readFileSync('results/results.json', 'utf8'));
    const ids = (rs: { scenarioId: string; pass: boolean }[]) => rs.map((r) => `${r.scenarioId}:${r.pass}`);
    expect(ids(saved.A)).toEqual(ids(run.A)); expect(ids(saved.B)).toEqual(ids(run.B));
  });
});

describe('llm judge (mocked HTTP; never run live)', () => {
  const r = runScenario(SCENARIOS[0], CONFIGS.B);
  it('builds a prompt containing expectation and transcript', () => expect(buildPrompt(r)).toContain('Caller: What are your hours?'));
  it('validates verdict JSON', () => {
    expect(parseVerdict('x {"helpful":5,"tone":4,"rationale":"ok"} y').helpful).toBe(5);
    expect(() => parseVerdict('{"helpful":9,"tone":4,"rationale":"x"}')).toThrow();
    expect(() => parseVerdict('nope')).toThrow();
  });
  it('surfaces API errors', async () => {
    const f = (async () => ({ ok: false, status: 401 })) as unknown as typeof fetch;
    await expect(judge(r, 'k', f)).rejects.toThrow('401');
  });
  it('parses a successful response', async () => {
    const f = (async () => ({ ok: true, json: async () => ({ content: [{ text: '{"helpful":4,"tone":5,"rationale":"clear"}' }] }) })) as unknown as typeof fetch;
    await expect(judge(r, 'k', f)).resolves.toMatchObject({ helpful: 4, tone: 5 });
  });
});
