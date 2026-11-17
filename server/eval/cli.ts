import { anthropicClient } from '../llm';
import { runEval } from './runner';
import { exportPublic, saveRun } from './store';
import { summarizeRun } from '../../src/llm/metrics';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set (load it from .env or Render env). Aborting.'); process.exit(1); }
const ids = arg('scenarios')?.split(',');
const run = await runEval(anthropicClient(), {
  scenarioIds: ids, trials: Number(arg('trials', '1')), judge: process.argv.includes('--judge'), budgetUsd: Number(arg('budget', '2')), concurrency: Number(arg('concurrency', '4')),
  onProgress: (d, t, l) => console.log(`${d}/${t} ${l?.agent} ${l?.scenarioId} #${l?.trial} ${l?.pass ? 'PASS' : 'FAIL(' + l?.failureCategory + ')'}`),
});
saveRun(run);
if (!ids && !process.argv.includes('--no-export')) exportPublic(run);
const s = summarizeRun(run);
const f = (x: number) => (x * 100).toFixed(1) + '%';
console.log(`\nmodel ${run.model} | trials/scenario ${run.trialsPerScenario} | cost $${s.totalCostUsd.toFixed(3)}${run.stoppedByBudget ? ' | STOPPED BY BUDGET' : ''}`);
for (const a of ['A', 'B'] as const) console.log(`${a}: pass ${s[a].passed}/${s[a].trials} (${f(s[a].passRate)}) goal ${f(s[a].completionRate)} tools ${s[a].toolCallsOk}/${s[a].toolCalls} claims ${s[a].unsupportedClaims} safety ${s[a].safetyViolations} errors ${s[a].errors} p95 ${s[a].latencyP95Ms.toFixed(0)}ms`);
console.log('saved', run.id);
