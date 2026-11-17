// Post-deploy check for the API. Usage: node scripts/verify-deploy.mjs https://<service>.onrender.com [--chat]
// Without --chat it spends nothing. With --chat it sends one short message to Agent B (about $0.001) and checks that a real tool call and database state come back.
const base = (process.argv[2] ?? '').replace(/\/$/, '');
const withChat = process.argv.includes('--chat');
const ORIGIN = 'https://rishi-creator-11.github.io';
if (!base) { console.error('usage: node scripts/verify-deploy.mjs <api-base-url> [--chat]'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const get = (path, headers = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(90_000) });

const h = await get('/api/health', { origin: ORIGIN });
const health = await h.json().catch(() => ({}));
check('health responds', h.ok && health.ok === true, `HTTP ${h.status}`);
check('model key configured on the server', health.llmConfigured === true);
check('admin token configured', health.adminConfigured === true);
check('public chat enabled', health.publicChatEnabled === true);
check('CORS allows the GitHub Pages origin', h.headers.get('access-control-allow-origin') === ORIGIN);
const evil = await get('/api/health', { origin: 'https://evil.example' });
check('CORS rejects other origins', evil.headers.get('access-control-allow-origin') === null);
const noAuth = await fetch(base + '/api/admin/eval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
check('admin endpoints reject requests without a token', noAuth.status === 401, `HTTP ${noAuth.status}`);
check('limits are set', health.limits?.maxTurnsPerSession > 0 && health.limits?.sessionCostCapUsd > 0, JSON.stringify(health.limits ?? {}));
const body = JSON.stringify(health);
check('health output contains no secrets', !/sk-ant|ADMIN_TOKEN/i.test(body));

if (withChat) {
  const r = await fetch(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ agent: 'B', message: 'Is Thursday, November 19 at 10am open for a cleaning? Please check the calendar.' }), signal: AbortSignal.timeout(90_000) });
  const j = await r.json().catch(() => ({}));
  check('chat returns a real model reply', r.ok && typeof j.reply === 'string' && j.reply.length > 0, `HTTP ${r.status}`);
  check('the model called a backend tool', Array.isArray(j.toolCalls) && j.toolCalls.length > 0, (j.toolCalls ?? []).map((t) => t.name).join(', '));
  check('database state returned', Array.isArray(j.bookings) && j.bookings.length >= 5);
  check('usage and cost reported', j.usage?.llmCalls > 0 && j.usage?.costUsd > 0);
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
