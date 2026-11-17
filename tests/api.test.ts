import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app';
import { loadConfig } from '../server/config';
import type { LlmClient, LlmResponse } from '../server/llm';

// TEST DOUBLE: a scripted LlmClient used ONLY to test server plumbing (tool loop, limits, auth).
// It is never used for any displayed evaluation result.
const scripted = (steps: Partial<LlmResponse>['content'][]): LlmClient => { let i = 0; return { async complete() { const content = steps[Math.min(i++, steps.length - 1)]!; return { content, stopReason: 'end_turn', inputTokens: 1000, outputTokens: 100, ms: 5 }; } }; };
const book = { type: 'tool_use' as const, id: 't1', name: 'create_booking', input: { full_name: 'Sam Lee', phone: '631-555-0142', service: 'cleaning', date: '2026-11-19', time: '10:00' } };
const say = (text: string) => [{ type: 'text' as const, text }];

const logs: string[] = []; const apps: ReturnType<typeof createApp>[] = [];
const make = (env: Record<string, string> = {}, client: LlmClient = scripted([say('hello')]), llmConfigured = true) => {
  const a = createApp({ config: loadConfig({ ADMIN_TOKEN: 'adm-secret', ...env }), client, llmConfigured, log: (l) => logs.push(l) }); apps.push(a); return a;
};
afterEach(() => { apps.splice(0).forEach((a) => a._internals.stop()); logs.length = 0; });
const chat = (a: ReturnType<typeof createApp>, body: object) => request(a).post('/api/chat').send(body);

describe('chat API', () => {
  it('executes the model-chosen tool against the DB and returns the real database state', async () => {
    const a = make({}, scripted([[book], say('Booked! Your code is BK-1006.')]));
    const r = await chat(a, { agent: 'B', message: 'book me' });
    expect(r.status).toBe(200);
    expect(r.body.toolCalls[0]).toMatchObject({ name: 'create_booking', result: { ok: true, confirmation_code: 'BK-1006' } });
    expect(r.body.bookings.find((b: { code: string }) => b.code === 'BK-1006')).toMatchObject({ date: '2026-11-19', time: '10:00', status: 'active' });
    expect(r.body.usage.llmCalls).toBe(2);
  });
  it('keeps conversation context and isolates sessions', async () => {
    const a = make({}, scripted([say('one'), say('two')]));
    const r1 = await chat(a, { agent: 'A', message: 'hi' });
    const r2 = await chat(a, { agent: 'A', message: 'again', sessionId: r1.body.sessionId });
    expect(r2.body.sessionId).toBe(r1.body.sessionId);
    const r3 = await chat(a, { agent: 'A', message: 'other caller' });
    expect(r3.body.sessionId).not.toBe(r1.body.sessionId);
  });
  it('validates input', async () => {
    const a = make();
    expect((await chat(a, { agent: 'C', message: 'x' })).status).toBe(400);
    expect((await chat(a, { agent: 'A', message: '' })).status).toBe(400);
    expect((await chat(a, { agent: 'A', message: 'x'.repeat(501) })).status).toBe(400);
    expect((await chat(a, { agent: 'A', message: 'x', extra: 1 })).status).toBe(400);
    expect((await chat(a, { agent: 'A', message: 'x', sessionId: '11111111-1111-4111-8111-111111111111' })).status).toBe(404);
  });
  it('enforces the per-session turn limit and blocks switching agents mid-session', async () => {
    const a = make({ MAX_TURNS_PER_SESSION: '2' });
    const r = await chat(a, { agent: 'A', message: 'one' });
    expect((await chat(a, { agent: 'B', message: 'x', sessionId: r.body.sessionId })).status).toBe(400);
    await chat(a, { agent: 'A', message: 'two', sessionId: r.body.sessionId });
    const third = await chat(a, { agent: 'A', message: 'three', sessionId: r.body.sessionId });
    expect(third.status).toBe(429); expect(third.body.error).toBe('SESSION_TURN_LIMIT');
  });
  it('enforces per-session cost cap', async () => {
    const a = make({ SESSION_COST_CAP_USD: '0.0000001' });
    const r = await chat(a, { agent: 'A', message: 'one' });
    expect((await chat(a, { agent: 'A', message: 'two', sessionId: r.body.sessionId })).body.error).toBe('SESSION_COST_LIMIT');
  });
  it('rate-limits by IP', async () => {
    const a = make({ IP_CHAT_PER_WINDOW: '2' });
    expect((await chat(a, { agent: 'A', message: '1' })).status).toBe(200);
    expect((await chat(a, { agent: 'A', message: '2' })).status).toBe(200);
    expect((await chat(a, { agent: 'A', message: '3' })).status).toBe(429);
  });
  it('stops at the daily budget and when the kill switch is off', async () => {
    const a = make({ DAILY_BUDGET_USD: '1' }); a._internals.setSpend(1);
    expect((await chat(a, { agent: 'A', message: 'x' })).body.error).toBe('DAILY_BUDGET_REACHED');
    const b = make({ PUBLIC_CHAT_ENABLED: 'false' });
    expect((await chat(b, { agent: 'A', message: 'x' })).body.error).toBe('CHAT_DISABLED');
  });
  it('kill switch can be flipped by admin only', async () => {
    const a = make();
    expect((await request(a).post('/api/admin/chat').send({ enabled: false })).status).toBe(401);
    expect((await request(a).post('/api/admin/chat').set('Authorization', 'Bearer wrong').send({ enabled: false })).status).toBe(401);
    expect((await request(a).post('/api/admin/chat').set('Authorization', 'Bearer adm-secret').send({ enabled: false })).body.publicChatEnabled).toBe(false);
    expect((await chat(a, { agent: 'A', message: 'x' })).body.error).toBe('CHAT_DISABLED');
  });
  it('reports not-configured instead of faking a reply', async () => {
    const a = make({}, scripted([say('x')]), false);
    const r = await chat(a, { agent: 'A', message: 'hi' });
    expect(r.status).toBe(503); expect(r.body.error).toBe('LLM_NOT_CONFIGURED');
    expect((await request(a).get('/api/health')).body).toMatchObject({ llmConfigured: false, publicChatEnabled: false });
  });
  it('hides upstream error details from the browser', async () => {
    const failing: LlmClient = { async complete() { throw new Error('Anthropic API error 401: invalid x-api-key sk-ant-SECRET'); } };
    const r = await chat(make({}, failing), { agent: 'A', message: 'hi' });
    expect(r.status).toBe(502); expect(JSON.stringify(r.body)).not.toMatch(/sk-ant|401|x-api-key/);
  });
});

describe('voice channel', () => {
  const capture = () => { const seen: { system: string; maxTokens: number }[] = []; const client: LlmClient = { async complete(r) { seen.push({ system: r.system, maxTokens: r.maxTokens }); return { content: say('ok'), stopReason: 'end_turn', inputTokens: 10, outputTokens: 5, ms: 1 }; } }; return { seen, client }; };
  it('adds the phone-call style and a lower token cap only for the voice channel, for both agents', async () => {
    const { seen, client } = capture(); const a = make({}, client);
    await chat(a, { agent: 'A', channel: 'voice', message: 'hi' }); await chat(a, { agent: 'B', channel: 'voice', message: 'hi' }); await chat(a, { agent: 'B', message: 'hi' });
    expect(seen[0].system).toContain('Phone call style'); expect(seen[1].system).toContain('Phone call style'); expect(seen[2].system).not.toContain('Phone call style');
    expect(seen[0].maxTokens).toBeLessThan(seen[2].maxTokens);
  });
  it('defaults to text and rejects unknown channels', async () => {
    const a = make(); expect((await chat(a, { agent: 'A', message: 'hi' })).body.channel).toBe('text');
    expect((await chat(a, { agent: 'A', channel: 'sms', message: 'hi' })).status).toBe(400);
  });
});

describe('concurrency and budget reservation', () => {
  const slow = (ms: number): LlmClient => ({ async complete() { await new Promise((r) => setTimeout(r, ms)); return { content: say('ok'), stopReason: 'end_turn', inputTokens: 10, outputTokens: 5, ms }; } });
  it('allows only one in-flight turn per session', async () => {
    const a = make({}, slow(80));
    const first = await chat(a, { agent: 'A', message: 'hi' });
    const [x, y] = await Promise.all([chat(a, { agent: 'A', message: 'one', sessionId: first.body.sessionId }), chat(a, { agent: 'A', message: 'two', sessionId: first.body.sessionId })]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });
  it('caps concurrent upstream chats', async () => {
    const a = make({ MAX_CONCURRENT_CHATS: '1' }, slow(80));
    const rs = await Promise.all([chat(a, { agent: 'A', message: '1' }), chat(a, { agent: 'A', message: '2' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 503]);
  });
  it('reserves worst-case cost so parallel requests cannot overshoot the daily budget', async () => {
    const a = make({ DAILY_BUDGET_USD: '0.015', TURN_RESERVE_USD: '0.01' }, slow(80));
    const rs = await Promise.all([chat(a, { agent: 'A', message: '1' }), chat(a, { agent: 'A', message: '2' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 503]);
  });
});

describe('admin eval API and logging', () => {
  it('requires the admin token', async () => {
    const a = make();
    expect((await request(a).post('/api/admin/eval').send({})).status).toBe(401);
    expect((await request(a).get('/api/admin/runs')).status).toBe(401);
  });
  it('rejects bad eval requests', async () => {
    const a = make(); const auth = { Authorization: 'Bearer adm-secret' };
    expect((await request(a).post('/api/admin/eval').set(auth).send({ trials: 99 })).status).toBe(400);
    expect((await request(a).post('/api/admin/eval').set(auth).send({ scenarioIds: ['nope'] })).body.error).toBe('UNKNOWN_SCENARIO');
  });
  it('is disabled when no admin token is configured', async () => {
    const a = createApp({ config: loadConfig({}), client: scripted([say('x')]), llmConfigured: true, log: () => {} }); apps.push(a);
    expect((await request(a).post('/api/admin/chat').set('Authorization', 'Bearer ').send({ enabled: true })).status).toBe(401);
  });
  it('logs requests without bodies, tokens or secrets', async () => {
    const a = make(); await chat(a, { agent: 'A', message: 'my phone is 631-555-0142' });
    await request(a).get('/api/health').set('Authorization', 'Bearer adm-secret');
    const all = logs.join('\n');
    expect(all).toMatch(/POST \/api\/chat 200/); expect(all).not.toMatch(/631-555|adm-secret|sk-ant/);
  });
  it('CORS allows only configured origins', async () => {
    const a = make({ CORS_ORIGINS: 'https://good.example' });
    expect((await request(a).get('/api/health').set('Origin', 'https://good.example')).headers['access-control-allow-origin']).toBe('https://good.example');
    expect((await request(a).get('/api/health').set('Origin', 'https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
  });
});
