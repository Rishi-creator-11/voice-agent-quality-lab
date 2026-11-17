import { createClinicDb, handoffs, snapshot, type BookingRow, type Db } from './db';
import { costUsd, type ContentBlock, type LlmClient, type Message } from './llm';
import { PROMPTS, VOICE_MAX_TOKENS, VOICE_STYLE, type AgentId } from './prompts';
import { TOOL_DEFS } from './toolDefs';
import { ClinicBackend, type ToolResult } from './tools';

export interface ToolTrace { name: string; input: Record<string, unknown>; result: ToolResult; ms: number; }
export interface TurnUsage { llmCalls: number; inputTokens: number; outputTokens: number; llmMs: number; costUsd: number; }
export interface TurnResult { reply: string; toolCalls: ToolTrace[]; usage: TurnUsage; totalMs: number; error?: string; loopLimitHit?: boolean; }

export const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 500;

/** One conversation: its own isolated database, message history and usage totals. */
export class Conversation {
  readonly db: Db = createClinicDb();
  private backend = new ClinicBackend(this.db);
  private messages: Message[] = [];
  private createdCodes: string[] = [];
  usage: TurnUsage = { llmCalls: 0, inputTokens: 0, outputTokens: 0, llmMs: 0, costUsd: 0 };
  userTurns = 0;
  constructor(readonly agent: AgentId, private client: LlmClient, readonly channel: 'text' | 'voice' = 'text') {}

  /** Session note given to Agent B only (system-maintained state). */
  private stateNote(): string {
    return `\n\n# Session state (maintained by the system)\n- Bookings created during this call: ${this.createdCodes.join(', ') || 'none'}\n- Transfer to front desk already requested: ${handoffs(this.db).length ? 'yes' : 'no'}`;
  }

  async send(userText: string): Promise<TurnResult> {
    const t0 = performance.now();
    this.userTurns++;
    this.messages.push({ role: 'user', content: userText });
    const toolCalls: ToolTrace[] = []; const u: TurnUsage = { llmCalls: 0, inputTokens: 0, outputTokens: 0, llmMs: 0, costUsd: 0 };
    const finish = (r: Partial<TurnResult> & { reply: string }): TurnResult => {
      this.usage.llmCalls += u.llmCalls; this.usage.inputTokens += u.inputTokens; this.usage.outputTokens += u.outputTokens; this.usage.llmMs += u.llmMs;
      u.costUsd = costUsd(u.inputTokens, u.outputTokens); this.usage.costUsd += u.costUsd;
      return { toolCalls, usage: u, totalMs: performance.now() - t0, ...r };
    };
    const system = PROMPTS[this.agent] + (this.agent === 'B' ? this.stateNote() : '') + (this.channel === 'voice' ? VOICE_STYLE : '');
    const maxTokens = this.channel === 'voice' ? VOICE_MAX_TOKENS : MAX_TOKENS;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let res;
      try { res = await this.client.complete({ system, messages: this.messages, tools: TOOL_DEFS, maxTokens }); }
      catch (e) { this.messages.pop(); return finish({ reply: '', error: (e as Error).message }); }
      u.llmCalls++; u.inputTokens += res.inputTokens; u.outputTokens += res.outputTokens; u.llmMs += res.ms;
      this.messages.push({ role: 'assistant', content: res.content });
      const uses = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (!uses.length) return finish({ reply: res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim() });
      const results: ContentBlock[] = [];
      for (const use of uses) {
        const s = performance.now();
        const result = this.backend.execute(use.name, use.input);
        if (use.name === 'create_booking' && result.ok && typeof result.confirmation_code === 'string' && !this.createdCodes.includes(result.confirmation_code)) this.createdCodes.push(result.confirmation_code);
        toolCalls.push({ name: use.name, input: use.input, result, ms: performance.now() - s });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result), is_error: !result.ok });
      }
      this.messages.push({ role: 'user', content: results });
    }
    return finish({ reply: '', loopLimitHit: true, error: `tool loop exceeded ${MAX_TOOL_ROUNDS} rounds` });
  }

  bookings(): BookingRow[] { return snapshot(this.db); }
  handoffs(): string[] { return handoffs(this.db); }
}
