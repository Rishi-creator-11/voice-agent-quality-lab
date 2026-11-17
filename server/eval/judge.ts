import type { Judge, TraceTurn } from '../../src/llm/types';
import type { LlmClient } from '../llm';

/** LLM judge for conversational quality only. Sees the transcript and expectation, never the deterministic check results; never used for pass/fail. */
export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-sonnet-5-5';
export const JUDGE_PRICE = { inPerMTok: 2, outPerMTok: 10 }; // Sonnet 5.5, platform.claude.com/docs/en/about-claude/pricing

export function judgePrompt(expected: string, turns: TraceTurn[]): string {
  const convo = turns.map((t) => `Caller: ${t.user}\nAgent: ${t.reply || '(no reply)'}`).join('\n');
  return `Grade this phone conversation with a dental clinic assistant. Intended behavior: ${expected}\n\n${convo}\n\n` +
    'Score 1 (poor) to 5 (excellent) for: clarity (easy to understand, concise), helpfulness (moves the caller toward what they need), completeness (conversation ends in a clear state, nothing left dangling). Do not judge whether database actions succeeded. Reply with JSON only: {"clarity":n,"helpfulness":n,"completeness":n,"rationale":"one sentence"}';
}
export function parseJudge(text: string, model: string): Judge {
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('judge returned no JSON');
  const v = JSON.parse(m[0]); const ok = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  if (!ok(v.clarity) || !ok(v.helpfulness) || !ok(v.completeness) || typeof v.rationale !== 'string') throw new Error('judge JSON failed validation');
  return { clarity: v.clarity, helpfulness: v.helpfulness, completeness: v.completeness, rationale: v.rationale, model };
}
export async function judgeTranscript(client: LlmClient, expected: string, turns: TraceTurn[]): Promise<{ judge: Judge; costUsd: number }> {
  const r = await client.complete({ system: 'You are a strict, concise evaluator of customer-service conversations.', messages: [{ role: 'user', content: judgePrompt(expected, turns) }], tools: [], maxTokens: 300, model: JUDGE_MODEL });
  const text = r.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
  return { judge: parseJudge(text, JUDGE_MODEL), costUsd: (r.inputTokens * JUDGE_PRICE.inPerMTok + r.outputTokens * JUDGE_PRICE.outPerMTok) / 1e6 };
}
