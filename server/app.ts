import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Conversation } from './agent';
import type { Config } from './config';
import { AGENT_CHANGES } from './prompts';
import { MODEL, type LlmClient } from './llm';
import { LLM_SCENARIOS } from './eval/scenarios';
import { runEval } from './eval/runner';
import { listRuns, loadRun, saveRun, exportPublic } from './eval/store';
import { summarizeRun } from '../src/llm/metrics';

interface Session { conv: Conversation; lastUsed: number; ipHash: string; busy: boolean; }
interface EvalJob { id: string; status: 'running' | 'done' | 'failed' | 'cancelled'; done: number; total: number; runId?: string; error?: string; cancel: boolean; }

export interface Deps { config: Config; client: LlmClient; llmConfigured: boolean; now?: () => number; log?: (line: string) => void; }

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 10);
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function createApp(d: Deps) {
  const { config: cfg, client } = d; const now = d.now ?? Date.now; const log = d.log ?? ((l) => console.log(l));
  const sessions = new Map<string, Session>();
  let reservedUsd = 0; let inflight = 0; let chatEnabled = cfg.publicChatEnabled; let spendDay = new Date(now()).toISOString().slice(0, 10); let spendUsd = 0; let evalJob: EvalJob | null = null;
  const rollDay = () => { const t = new Date(now()).toISOString().slice(0, 10); if (t !== spendDay) { spendDay = t; spendUsd = 0; } };

  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(cors({ origin: (o, cb) => cb(null, !o || cfg.corsOrigins.includes(o)), methods: ['GET', 'POST'], allowedHeaders: ['content-type', 'authorization'] }));
  app.use(express.json({ limit: '8kb' }));
  // Request log: method, path, status, duration, hashed IP. Never bodies, headers or query strings.
  app.use((req, res, next) => { const t = now(); res.on('finish', () => log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${now() - t}ms ip=${hash(req.ip ?? '')}`)); next(); });

  const ipLimit = rateLimit({ windowMs: cfg.ipWindowMs, limit: cfg.ipChatPerWindow, standardHeaders: true, legacyHeaders: false, message: { error: 'RATE_LIMITED', message: 'Too many requests from this address. Try again later.' } });
  const adminLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'RATE_LIMITED' } });
  const admin = (req: Request, res: Response, next: NextFunction) => {
    const tok = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!cfg.adminToken || !tok || !same(tok, cfg.adminToken)) return void res.status(401).json({ error: 'UNAUTHORIZED' });
    next();
  };

  const sweep = () => { for (const [id, s] of sessions) if (now() - s.lastUsed > cfg.sessionTtlMs) sessions.delete(id); };
  const sweeper = setInterval(sweep, 60_000); sweeper.unref?.();

  app.get('/api/health', (_req, res) => { rollDay(); res.json({
    ok: true, model: MODEL, llmConfigured: d.llmConfigured, publicChatEnabled: chatEnabled && d.llmConfigured,
    limits: { maxTurnsPerSession: cfg.maxTurnsPerSession, maxMessageChars: cfg.maxMessageChars, sessionCostCapUsd: cfg.sessionCostCapUsd, ipChatPerWindow: cfg.ipChatPerWindow, ipWindowMinutes: cfg.ipWindowMs / 60_000 },
    dailyBudgetReached: spendUsd >= cfg.dailyBudgetUsd, adminConfigured: !!cfg.adminToken,
  }); });

  const chatBody = z.object({ sessionId: z.string().uuid().optional(), agent: z.enum(['A', 'B']), channel: z.enum(['text', 'voice']).default('text'), message: z.string().trim().min(1).max(cfg.maxMessageChars) }).strict();
  app.post('/api/chat', ipLimit, async (req, res) => {
    rollDay(); sweep();
    if (!d.llmConfigured) return void res.status(503).json({ error: 'LLM_NOT_CONFIGURED', message: 'No model API key is configured on the server.' });
    if (!chatEnabled) return void res.status(503).json({ error: 'CHAT_DISABLED', message: 'Live chat is currently switched off.' });
    if (spendUsd + reservedUsd + cfg.turnReserveUsd > cfg.dailyBudgetUsd) return void res.status(503).json({ error: 'DAILY_BUDGET_REACHED', message: 'The demo reached its daily usage budget. Results from recorded evaluation runs are still available.' });
    const p = chatBody.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: 'VALIDATION', issues: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    let s = p.data.sessionId ? sessions.get(p.data.sessionId) : undefined;
    if (p.data.sessionId && !s) return void res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'Session expired. Start a new conversation.' });
    if (s && s.conv.agent !== p.data.agent) return void res.status(400).json({ error: 'AGENT_MISMATCH', message: 'Start a new conversation to switch agents.' });
    if (!s) {
      if (sessions.size >= cfg.maxSessions) return void res.status(503).json({ error: 'AT_CAPACITY', message: 'Too many active conversations. Try again in a few minutes.' });
      s = { conv: new Conversation(p.data.agent, client, p.data.channel), lastUsed: now(), ipHash: hash(req.ip ?? ''), busy: false };
    }
    if (s.busy) return void res.status(409).json({ error: 'TURN_IN_PROGRESS', message: 'Wait for the previous reply before sending another message.' });
    if (inflight >= cfg.maxConcurrentChats) return void res.status(503).json({ error: 'AT_CAPACITY', message: 'The demo is busy. Try again in a moment.' });
    if (s.conv.userTurns >= cfg.maxTurnsPerSession) return void res.status(429).json({ error: 'SESSION_TURN_LIMIT', message: `This conversation reached its ${cfg.maxTurnsPerSession}-message limit. Start a new one.` });
    if (s.conv.usage.costUsd >= cfg.sessionCostCapUsd) return void res.status(429).json({ error: 'SESSION_COST_LIMIT', message: 'This conversation reached its usage limit. Start a new one.' });
    const id = p.data.sessionId ?? randomUUID(); sessions.set(id, s); s.lastUsed = now();
    // One in-flight turn per session, worst-case cost reserved up front and settled to actual cost afterwards.
    s.busy = true; inflight++; reservedUsd += cfg.turnReserveUsd;
    let r;
    try { r = await s.conv.send(p.data.message); }
    catch { return void res.status(502).json({ error: 'UPSTREAM_ERROR', sessionId: id, message: 'The agent failed for this message. Please try again.' }); }
    finally { s.busy = false; inflight--; reservedUsd -= cfg.turnReserveUsd; }
    spendUsd += r.usage.costUsd;
    // Upstream error details are not forwarded to the browser.
    if (r.error) return void res.status(502).json({ error: 'UPSTREAM_ERROR', sessionId: id, message: 'The model service failed for this message. Please try again.' });
    res.json({ sessionId: id, agent: s.conv.agent, channel: s.conv.channel, reply: r.reply, toolCalls: r.toolCalls, bookings: s.conv.bookings().map((b) => ({ code: b.code, name: b.full_name, service: b.service, date: b.date, time: b.time, status: b.status })), handoffs: s.conv.handoffs(), usage: r.usage, totalMs: r.totalMs, remainingTurns: cfg.maxTurnsPerSession - s.conv.userTurns });
  });

  app.post('/api/session/end', ipLimit, (req, res) => { const id = z.string().uuid().safeParse(req.body?.sessionId); if (id.success) sessions.delete(id.data); res.json({ ok: true }); });

  app.get('/api/agents', (_req, res) => res.json({ model: MODEL, changes: AGENT_CHANGES, scenarios: LLM_SCENARIOS.map((s) => ({ id: s.id, title: s.title, category: s.category })) }));
  app.get('/api/results/latest', (_req, res) => { const l = listRuns()[0]; const run = l && loadRun(l.id); run ? res.json(run) : res.status(404).json({ error: 'NO_RUNS', message: 'No evaluation runs recorded on this server yet.' }); });

  // ---- admin (token required)
  app.post('/api/admin/chat', adminLimit, admin, (req, res) => { chatEnabled = req.body?.enabled === true; res.json({ publicChatEnabled: chatEnabled }); });
  const evalBody = z.object({ scenarioIds: z.array(z.string()).max(60).optional(), agents: z.array(z.enum(['A', 'B'])).min(1).optional(), trials: z.number().int().min(1).max(cfg.maxEvalTrials).default(1), judge: z.boolean().default(false), publish: z.boolean().default(false) }).strict();
  app.post('/api/admin/eval', adminLimit, admin, (req, res) => {
    if (!d.llmConfigured) return void res.status(503).json({ error: 'LLM_NOT_CONFIGURED' });
    if (evalJob?.status === 'running') return void res.status(409).json({ error: 'EVAL_RUNNING', jobId: evalJob.id });
    const p = evalBody.safeParse(req.body ?? {});
    if (!p.success) return void res.status(400).json({ error: 'VALIDATION', issues: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const unknown = (p.data.scenarioIds ?? []).filter((x) => !LLM_SCENARIOS.some((s) => s.id === x));
    if (unknown.length) return void res.status(400).json({ error: 'UNKNOWN_SCENARIO', unknown });
    const job: EvalJob = { id: randomUUID(), status: 'running', done: 0, total: 0, cancel: false }; evalJob = job;
    const n = (p.data.scenarioIds ?? LLM_SCENARIOS.map((s) => s.id)).length; job.total = n * (p.data.agents?.length ?? 2) * p.data.trials;
    runEval(client, { ...p.data, budgetUsd: cfg.evalBudgetUsd, onProgress: (done) => { job.done = done; }, shouldCancel: () => job.cancel })
      .then((run) => { saveRun(run); if (p.data.publish && !p.data.scenarioIds) exportPublic(run); job.runId = run.id; job.status = job.cancel ? 'cancelled' : 'done'; spendUsd += summarizeRun(run).totalCostUsd + run.judgeCostUsd; })
      .catch((e) => { job.status = 'failed'; job.error = (e as Error).message; });
    res.status(202).json({ jobId: job.id, total: job.total });
  });
  app.get('/api/admin/eval/:id', adminLimit, admin, (req, res) => { evalJob && evalJob.id === req.params.id ? res.json({ status: evalJob.status, done: evalJob.done, total: evalJob.total, runId: evalJob.runId, error: evalJob.error }) : res.status(404).json({ error: 'NOT_FOUND' }); });
  app.post('/api/admin/eval/:id/cancel', adminLimit, admin, (req, res) => { if (evalJob && evalJob.id === req.params.id) evalJob.cancel = true; res.json({ ok: true }); });
  app.get('/api/admin/runs', adminLimit, admin, (_req, res) => res.json(listRuns()));
  app.get('/api/admin/runs/:id', adminLimit, admin, (req, res) => { const r = loadRun(req.params.id); r ? res.json(r) : res.status(404).json({ error: 'NOT_FOUND' }); });

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => { log(`error ${err.name}`); res.status(err.name === 'PayloadTooLargeError' ? 413 : 500).json({ error: 'SERVER_ERROR' }); });
  return Object.assign(app, { _internals: { sessions, setSpend: (v: number) => { spendUsd = v; }, stop: () => clearInterval(sweeper) } });
}
