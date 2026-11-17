/** Shape of recorded real-LLM evaluation runs. Shared by the server (writer) and the dashboard (reader). */
export type AgentId = 'A' | 'B';
export type CheckKind = 'outcome' | 'tool' | 'accuracy' | 'safety';
export interface TraceTool { name: string; input: Record<string, unknown>; result: { ok: boolean; [k: string]: unknown }; ms: number; }
export interface TraceTurn {
  user: string; reply: string; toolCalls: TraceTool[];
  inputTokens: number; outputTokens: number; llmCalls: number; costUsd: number; totalMs: number; error?: string;
}
export interface TrialCheck { name: string; kind: CheckKind; pass: boolean; detail: string; }
export interface FinalBooking { code: string; name: string; service: string; date: string; time: string; status: string; change: 'seed' | 'created' | 'modified'; }
export interface Judge { clarity: number; helpfulness: number; completeness: number; rationale: string; model: string; }
export interface Trial {
  scenarioId: string; title: string; category: string; expected: string; agent: AgentId; trial: number;
  turns: TraceTurn[]; checks: TrialCheck[]; incidents: { type: string; turn: number; evidence: string }[];
  finalBookings: FinalBooking[]; handoffs: string[];
  pass: boolean; goalReached: boolean; failureCategory: 'none' | 'api_error' | 'safety' | 'outcome' | 'tool_use' | 'accuracy';
  judge?: Judge; judgeError?: string;
}
export interface EvalRun {
  id: string; startedAt: string; finishedAt: string; model: string; judgeModel: string | null;
  trialsPerScenario: number; scenarioIds: string[]; agents: AgentId[];
  prompts: Record<AgentId, string>; changes: { area: string; change: string; why: string }[];
  pricing: { inPerMTok: number; outPerMTok: number }; budgetUsd: number | null; stoppedByBudget: boolean;
  trials: Trial[]; judgeCostUsd: number;
}
