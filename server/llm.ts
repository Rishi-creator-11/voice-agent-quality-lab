/** Minimal Anthropic Messages client with timeout and retry. The key is read from the environment only and never logged. */
export const MODEL = process.env.AGENT_MODEL ?? 'claude-haiku-5-5';
/** USD per million tokens, Claude Haiku 5.5, prompts <= 100k tokens (platform.claude.com/docs/en/about-claude/pricing, checked 2026-11-16). */
export const PRICE = { inPerMTok: 0.10, outPerMTok: 0.50 };
export const costUsd = (inTok: number, outTok: number) => (inTok * PRICE.inPerMTok + outTok * PRICE.outPerMTok) / 1e6;

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };
export interface Message { role: 'user' | 'assistant'; content: string | ContentBlock[]; }
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; }
export interface LlmRequest { system: string; messages: Message[]; tools: ToolDef[]; maxTokens: number; model?: string; }
export interface LlmResponse { content: ContentBlock[]; stopReason: string; inputTokens: number; outputTokens: number; ms: number; }
export interface LlmClient { complete(req: LlmRequest): Promise<LlmResponse>; }

export class LlmError extends Error { constructor(msg: string, public status?: number) { super(msg); } }

export function anthropicClient(apiKey: string | undefined = process.env.ANTHROPIC_API_KEY, fetchImpl: typeof fetch = fetch, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): LlmClient {
  return {
    async complete(req) {
      if (!apiKey) throw new LlmError('LLM_DISABLED: no API key configured on the server');
      let last: LlmError | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        const t0 = performance.now();
        try {
          const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: req.model ?? MODEL, max_tokens: req.maxTokens, system: req.system, messages: req.messages, ...(req.tools.length ? { tools: req.tools } : {}) }),
            signal: AbortSignal.timeout(45_000),
          });
          if (res.ok) {
            const b = (await res.json()) as { content: ContentBlock[]; stop_reason: string; usage: { input_tokens: number; output_tokens: number } };
            return { content: b.content, stopReason: b.stop_reason, inputTokens: b.usage.input_tokens, outputTokens: b.usage.output_tokens, ms: performance.now() - t0 };
          }
          const retryable = res.status === 429 || res.status >= 500;
          const detail = await res.text().then((t) => { try { return (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? ''; } catch { return ''; } }).catch(() => '');
          last = new LlmError(`Anthropic API error ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, res.status);
          if (!retryable) throw last;
        } catch (e) {
          if (e instanceof LlmError && !(e.status === 429 || (e.status ?? 0) >= 500)) throw e;
          last = e instanceof LlmError ? e : new LlmError(`network/timeout: ${(e as Error).name}`);
        }
        await sleep(500 * 2 ** attempt);
      }
      throw last ?? new LlmError('unknown LLM failure');
    },
  };
}
