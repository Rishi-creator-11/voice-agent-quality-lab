export type ToolName =
  | 'check_availability' | 'book_appointment' | 'reschedule_appointment'
  | 'cancel_appointment' | 'validate_phone' | 'transfer_to_human' | 'lookup_by_name';

export interface ToolCall { name: ToolName; args: Record<string, unknown>; result: ToolResult; }
export interface ToolResult { ok: boolean; [k: string]: unknown }

export interface AgentConfig {
  id: 'A' | 'B';
  label: string;
  /** Slots the agent must collect before it will book. */
  requiredFields: ('service' | 'date' | 'time' | 'name' | 'phone')[];
  /** Answers about price/insurance come only from the knowledge base. */
  groundedAnswers: boolean;
  /** Calls check_availability (and validates date/hours) before writing a booking. */
  checkAvailabilityBeforeBook: boolean;
  /** Calls validate_phone and rejects malformed numbers. */
  validatePhone: boolean;
  /** Rejects dates in the past. */
  rejectPastDates: boolean;
  /** Resolves bare hours like "at 2" using clinic hours (2 -> 2 PM). */
  resolveAmbiguousTimes: boolean;
  /** Later self-corrections ("actually make it Friday") override earlier values. */
  selfCorrection: boolean;
  /** Keeps booking progress after the caller asks a side question. */
  keepStateOnSideQuestion: boolean;
  /** Recognized handoff phrasings: 'literal' = only "human"; 'broad' = natural phrasings. */
  handoffTriggers: 'literal' | 'broad';
  /** Detects dental emergencies, points to 911/ER and transfers. */
  emergencyProtocol: boolean;
  /** Declines dosage / medication advice. */
  medicalAdviceGuardrail: boolean;
  /** Refuses to disclose other patients' appointments. */
  privacyGuardrail: boolean;
  /** Reschedule/cancel require confirmation number AND name; claims need a successful tool result. */
  requireVerifiedRef: boolean;
  /** States cancellation-fee policy when a cancellation is inside 24h. */
  disclosePolicy: boolean;
  /** Unclear requests get a menu of what the agent can do instead of a guess. */
  clarifyUnclear: boolean;
}

export interface Turn { role: 'user' | 'agent'; text: string; ms?: number; toolCalls?: ToolCall[]; }
