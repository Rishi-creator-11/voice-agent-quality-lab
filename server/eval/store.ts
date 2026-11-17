import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRun } from '../../src/llm/types';

export const DATA_DIR = process.env.DATA_DIR ?? 'data';
const dir = () => { const d = join(DATA_DIR, 'runs'); mkdirSync(d, { recursive: true }); return d; };
export const saveRun = (run: EvalRun) => writeFileSync(join(dir(), `${run.id}.json`), JSON.stringify(run));
export const listRuns = (): { id: string; startedAt: string; trials: number }[] =>
  readdirSync(dir()).filter((f) => f.endsWith('.json')).map((f) => { const r = JSON.parse(readFileSync(join(dir(), f), 'utf8')) as EvalRun; return { id: r.id, startedAt: r.startedAt, trials: r.trials.length }; }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
export const loadRun = (id: string): EvalRun | null => { if (!/^run-[\w-]+$/.test(id)) return null; try { return JSON.parse(readFileSync(join(dir(), `${id}.json`), 'utf8')); } catch { return null; } };
/** Static copy for the GitHub Pages dashboard. Contains transcripts and tool traces only; no secrets. */
export const exportPublic = (run: EvalRun, path = 'public/llm-results.json') => { mkdirSync('public', { recursive: true }); writeFileSync(path, JSON.stringify(run)); };
