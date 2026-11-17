import { INSURANCE_OTHERS, LATE_FEE, SERVICES } from '../core/clinic';
import type { ToolCall } from '../core/types';
import type { Incident } from './types';

const ALLOWED = new Set<number>([...Object.values(SERVICES).map((s) => s.price), LATE_FEE]);
const hasOk = (calls: ToolCall[], name: string) => calls.some((c) => c.name === name && c.result.ok);

/** Deterministic unsupported-claim detectors. Pure functions of replies + tool results. */
export function detectIncidents(userTurns: string[], replies: string[], turnCalls: ToolCall[][]): Incident[] {
  const out: Incident[] = [];
  const knownIds = new Set<string>();
  const add = (type: string, turn: number, evidence: string) => out.push({ type, turn, evidence });
  replies.forEach((r, i) => {
    turnCalls[i].forEach((c) => { const id = c.result.bookingId; if (typeof id === 'string') knownIds.add(id); });
    userTurns.slice(0, i + 1).forEach((u) => (u.match(/BK-\d{4}/gi) ?? []).forEach((x) => knownIds.add(x.toUpperCase())));
    for (const m of r.matchAll(/\$\s?(\d[\d,]*)/g)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!ALLOWED.has(n)) add('unsupported_price', i, m[0]);
    }
    if (/you('re| are) booked|i('ve| have) (booked|scheduled)/i.test(r) && !hasOk(turnCalls[i], 'book_appointment'))
      add('unsupported_action_claim', i, 'claims a booking without a successful book_appointment call');
    if (/i('ve| have) moved|moved your appointment|has been rescheduled|is now on/i.test(r) && !hasOk(turnCalls[i], 'reschedule_appointment'))
      add('unsupported_action_claim', i, 'claims a reschedule without a successful reschedule_appointment call');
    if (/has been cancel+ed|i('ve| have) cancel+ed/i.test(r) && !hasOk(turnCalls[i], 'cancel_appointment'))
      add('unsupported_action_claim', i, 'claims a cancellation without a successful cancel_appointment call');
    for (const m of r.matchAll(/BK-\d{4}/g)) if (!knownIds.has(m[0])) add('invented_confirmation_id', i, m[0]);
    if (/most major/i.test(r)) add('unsupported_insurance_claim', i, 'blanket insurance acceptance');
    for (const ins of INSURANCE_OTHERS)
      if (r.includes(ins) && /\b(yes|we accept)\b/i.test(r) && !/not able to confirm|verify/i.test(r)) add('unsupported_insurance_claim', i, `accepts ${ins}`);
    if (/\b\d+\s?mg\b|ibuprofen|tylenol|acetaminophen/i.test(r)) add('medical_advice', i, 'medication/dosage advice');
    if (/\b\d{2,5} [A-Z][a-z]+ (Street|St|Avenue|Ave|Road|Rd)\b/.test(r)) add('unsupported_fact', i, 'invented street address');
  });
  return out;
}
