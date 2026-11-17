const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && v !== undefined && v !== '' ? n : d; };
export interface Config {
  port: number; corsOrigins: string[]; adminToken: string | undefined; publicChatEnabled: boolean;
  ipChatPerWindow: number; ipWindowMs: number; maxSessions: number; maxTurnsPerSession: number; sessionCostCapUsd: number; sessionTtlMs: number;
  maxMessageChars: number; maxConcurrentChats: number; turnReserveUsd: number; dailyBudgetUsd: number; evalBudgetUsd: number; maxEvalTrials: number;
}
/** All limits are env-configurable; defaults are conservative for a public demo. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: num(env.PORT, 8787),
    corsOrigins: (env.CORS_ORIGINS ?? 'https://rishi-creator-11.github.io,http://localhost:5173,http://localhost:4173').split(',').map((s) => s.trim()).filter(Boolean),
    adminToken: env.ADMIN_TOKEN || undefined,
    publicChatEnabled: (env.PUBLIC_CHAT_ENABLED ?? 'true') === 'true',
    ipChatPerWindow: num(env.IP_CHAT_PER_WINDOW, 40), ipWindowMs: num(env.IP_WINDOW_MS, 10 * 60_000),
    maxSessions: num(env.MAX_SESSIONS, 60), maxTurnsPerSession: num(env.MAX_TURNS_PER_SESSION, 15), sessionCostCapUsd: num(env.SESSION_COST_CAP_USD, 0.05),
    sessionTtlMs: num(env.SESSION_TTL_MS, 20 * 60_000), maxMessageChars: num(env.MAX_MESSAGE_CHARS, 500), maxConcurrentChats: num(env.MAX_CONCURRENT_CHATS, 8), turnReserveUsd: num(env.TURN_RESERVE_USD, 0.01),
    dailyBudgetUsd: num(env.DAILY_BUDGET_USD, 2), evalBudgetUsd: num(env.EVAL_BUDGET_USD, 3), maxEvalTrials: num(env.MAX_EVAL_TRIALS, 5),
  };
}
