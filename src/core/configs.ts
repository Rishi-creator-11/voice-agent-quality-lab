import type { AgentConfig } from './types';

/** Version A: the "first draft" policy a team might ship before QA. */
export const CONFIG_A: AgentConfig = {
  id: 'A', label: 'Version A — initial',
  requiredFields: ['service', 'date', 'time', 'name'],
  groundedAnswers: false,
  checkAvailabilityBeforeBook: false,
  validatePhone: false,
  rejectPastDates: false,
  resolveAmbiguousTimes: false,
  selfCorrection: false,
  keepStateOnSideQuestion: false,
  handoffTriggers: 'literal',
  emergencyProtocol: false,
  medicalAdviceGuardrail: false,
  privacyGuardrail: false,
  requireVerifiedRef: false,
  disclosePolicy: false,
  clarifyUnclear: false,
};

/** Version B: after reviewing Version A's failing scenarios. */
export const CONFIG_B: AgentConfig = {
  id: 'B', label: 'Version B — improved',
  requiredFields: ['service', 'date', 'time', 'name', 'phone'],
  groundedAnswers: true,
  checkAvailabilityBeforeBook: true,
  validatePhone: true,
  rejectPastDates: true,
  resolveAmbiguousTimes: true,
  selfCorrection: true,
  keepStateOnSideQuestion: true,
  handoffTriggers: 'broad',
  emergencyProtocol: true,
  medicalAdviceGuardrail: true,
  privacyGuardrail: true,
  requireVerifiedRef: true,
  disclosePolicy: true,
  clarifyUnclear: true,
};

export const CONFIGS = { A: CONFIG_A, B: CONFIG_B } as const;

export const CHANGE_NOTES: Record<keyof Omit<AgentConfig, 'id' | 'label'>, string> = {
  requiredFields: 'Also collect a phone number before booking (A never asked for one).',
  groundedAnswers: 'Prices, insurance and address come only from the knowledge base; unknowns are admitted and offered a handoff (A filled gaps with generic "typical" figures and guesses).',
  checkAvailabilityBeforeBook: 'Call check_availability before every booking/reschedule; handle closed, outside-hours and taken slots by offering real alternatives.',
  validatePhone: 'Call validate_phone and re-ask on malformed numbers.',
  rejectPastDates: 'Reject dates in the past.',
  resolveAmbiguousTimes: 'Read bare hours using clinic hours ("at 2" → 2 PM).',
  selfCorrection: 'Later corrections in one utterance override earlier values ("Thursday… actually Friday").',
  keepStateOnSideQuestion: 'Answer a side question, then resume the booking with collected details kept.',
  handoffTriggers: 'Recognize natural handoff requests ("front desk", "real person", "someone"), not only the word "human".',
  emergencyProtocol: 'Detect dental emergencies, direct caller to 911/ER and transfer.',
  medicalAdviceGuardrail: 'Decline medication/dosage advice.',
  privacyGuardrail: 'Refuse to disclose other patients’ appointments.',
  requireVerifiedRef: 'Reschedule/cancel need confirmation number + name; never claim a change without a successful tool result.',
  disclosePolicy: 'State the $50 late-cancellation fee when it applies.',
  clarifyUnclear: 'Unclear requests get a short menu of supported tasks.',
};
