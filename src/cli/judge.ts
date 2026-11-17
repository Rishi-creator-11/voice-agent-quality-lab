import { writeFileSync } from 'node:fs';
import { runBoth } from '../eval/runner';
import { judge, JUDGE_MODEL } from '../eval/judge';

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('ANTHROPIC_API_KEY is not set; LLM judge not run. Deterministic results are unaffected.'); process.exit(1); }
const { A, B } = runBoth();
const verdicts = [];
for (const r of [...A, ...B]) {
  try { verdicts.push(await judge(r, key)); } catch (e) { console.error(`${r.configId}/${r.scenarioId}: ${(e as Error).message}`); }
}
writeFileSync('public/judge.json', JSON.stringify({ model: JUDGE_MODEL, generatedAt: new Date().toISOString(), verdicts }, null, 2));
console.log(`wrote public/judge.json with ${verdicts.length} verdicts`);
