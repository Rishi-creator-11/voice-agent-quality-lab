import 'node:process';
import { Conversation } from './agent';
import { anthropicClient } from './llm';
const client = anthropicClient();
for (const agent of ['A', 'B'] as const) {
  const c = new Conversation(agent, client);
  for (const msg of ["Hi, I'd like to book a cleaning next Friday at 2pm.", 'Sam Lee, 631-555-0142. Yes, please go ahead.']) {
    const r = await c.send(msg);
    console.log(`[${agent}] user: ${msg}\n[${agent}] agent: ${r.reply || '(error) ' + r.error}\n   tools: ${r.toolCalls.map((t) => `${t.name}${t.result.ok ? '' : '✗'}`).join(', ') || 'none'} | ${r.usage.inputTokens}+${r.usage.outputTokens} tok, ${r.totalMs.toFixed(0)}ms, $${r.usage.costUsd.toFixed(5)}`);
  }
  console.log(`[${agent}] DB new bookings:`, c.bookings().filter((b) => b.seq > 5).map((b) => `${b.code} ${b.date} ${b.time}`), '\n');
}
