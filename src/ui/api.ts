/** Backend base URL, set at build time. Empty means "no backend connected". The browser never holds model keys. */
export const API_URL: string = ((import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface Health {
  ok: boolean; model: string; llmConfigured: boolean; publicChatEnabled: boolean; dailyBudgetReached: boolean; adminConfigured: boolean;
  limits: { maxTurnsPerSession: number; maxMessageChars: number; sessionCostCapUsd: number; ipChatPerWindow: number; ipWindowMinutes: number };
}
export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }

async function call<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  if (!API_URL) throw new ApiError('NO_BACKEND', 'No backend is connected to this deployment.');
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(init?.token ? { authorization: `Bearer ${init.token}` } : {}) };
  let res: Response;
  try { res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(60_000) }); }
  catch { throw new ApiError('UNREACHABLE', 'Could not reach the backend (it may be starting up; try again in a minute).'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `HTTP_${res.status}`, body.message ?? body.error ?? `Request failed (${res.status})`);
  return body as T;
}
export const getHealth = () => call<Health>('/api/health');
export interface ChatResponse {
  sessionId: string; agent: 'A' | 'B'; reply: string;
  toolCalls: { name: string; input: Record<string, unknown>; result: { ok: boolean; [k: string]: unknown }; ms: number }[];
  bookings: { code: string; name: string; service: string; date: string; time: string; status: string }[]; handoffs: string[];
  usage: { llmCalls: number; inputTokens: number; outputTokens: number; costUsd: number }; totalMs: number; remainingTurns: number;
}
export const postChat = (agent: 'A' | 'B', message: string, sessionId?: string) => call<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify({ agent, message, sessionId }) });
export const endSession = (sessionId: string) => call('/api/session/end', { method: 'POST', body: JSON.stringify({ sessionId }) }).catch(() => undefined);
export const getScenarios = () => call<{ model: string; scenarios: { id: string; title: string; category: string }[] }>('/api/agents');
export const startEval = (token: string, body: object) => call<{ jobId: string; total: number }>('/api/admin/eval', { method: 'POST', body: JSON.stringify(body), token });
export const evalStatus = (token: string, id: string) => call<{ status: string; done: number; total: number; runId?: string; error?: string }>(`/api/admin/eval/${id}`, { token });
export const getRun = (token: string, id: string) => call<import('../llm/types').EvalRun>(`/api/admin/runs/${id}`, { token });
