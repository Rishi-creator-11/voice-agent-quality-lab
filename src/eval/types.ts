import type { ToolCall, Turn } from '../core/types';
import type { Sandbox } from '../core/tools';
import type { AgentState } from '../core/agent';

export type CheckKind = 'outcome' | 'tool' | 'accuracy';
export interface CheckCtx {
  userTurns: string[]; replies: string[]; turnCalls: ToolCall[][]; calls: ToolCall[];
  sandbox: Sandbox; state: AgentState; incidents: Incident[];
}
export interface CheckResult { pass: boolean; detail: string; }
export interface Check { name: string; kind: CheckKind; run: (c: CheckCtx) => CheckResult; }
export interface Scenario {
  id: string; title: string; category: string;
  /** Expected behavior, written before running. */
  expected: string;
  turns: string[];
  checks: Check[];
}
export interface Incident { type: string; turn: number; evidence: string; }
export interface ScenarioResult {
  scenarioId: string; title: string; category: string; configId: 'A' | 'B';
  expected: string; actual: string; pass: boolean; goalReached: boolean;
  checks: { name: string; kind: CheckKind; pass: boolean; detail: string }[];
  incidents: Incident[]; transcript: Turn[]; latenciesMs: number[];
}
export interface Metrics {
  scenarios: number; passed: number; passRate: number;
  goalReached: number; completionRate: number;
  toolCalls: number; toolCallsOk: number; toolCallSuccessRate: number | null;
  toolChecks: number; toolChecksPassed: number; toolCheckPassRate: number | null;
  incidents: number; scenariosWithIncidents: number;
  latencyMeanMs: number; latencyP95Ms: number; turnsMeasured: number;
  byCategory: Record<string, { passed: number; total: number }>;
}
