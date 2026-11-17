import type { ScenarioResult } from './types';

/**
 * Optional LLM-judge pass. Kept separate from deterministic checks: its output is never
 * mixed into pass/fail metrics. Needs ANTHROPIC_API_KEY (CLI only; the key never reaches the browser).
 * Status: unit-tested with mocked HTTP; NOT yet run against the live API.
 */
export interface JudgeVerdict { scenarioId: string; configId: 'A' | 'B'; helpful: 1 | 2 | 3 | 4 | 5; tone: 1 | 2 | 3 | 4 | 5; rationale: string; }
export const JUDGE_MODEL = 'claude-haiku-5-5';

export function buildPrompt(r: ScenarioResult): string {
  const convo = r.transcript.map((t) => `${t.role === 'user' ? 'Caller' : 'Agent'}: ${t.text}`).join('\n');
  return `You are grading a dental-clinic phone assistant. Expected behavior: ${r.expected}\n\nConversation:\n${convo}\n\n` +
    'Rate helpfulness and tone from 1 (poor) to 5 (excellent). Reply with JSON only: {"helpful":n,"tone":n,"rationale":"one sentence"}';
}

export function parseVerdict(text: string): Pick<JudgeVerdict, 'helpful' | 'tone' | 'rationale'> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('judge returned no JSON');
  const v = JSON.parse(m[0]);
  const ok = (n: unknown): n is 1 | 2 | 3 | 4 | 5 => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  if (!ok(v.helpful) || !ok(v.tone) || typeof v.rationale !== 'string') throw new Error('judge JSON failed validation');
  return { helpful: v.helpful, tone: v.tone, rationale: v.rationale };
}

export async function judge(r: ScenarioResult, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<JudgeVerdict> {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: JUDGE_MODEL, max_tokens: 300, messages: [{ role: 'user', content: buildPrompt(r) }] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`judge API error ${res.status}`);
  const body = (await res.json()) as { content?: { text?: string }[] };
  return { scenarioId: r.scenarioId, configId: r.configId, ...parseVerdict(body.content?.[0]?.text ?? '') };
}
