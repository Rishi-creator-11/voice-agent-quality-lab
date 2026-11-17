import { SCENARIOS } from '../../src/eval/scenarios';
import { booked, called, calledBefore, everyReplyHas, handedOff, noBookingAt, noClaims, noMedicalAdvice, noNewBookings, notCalled, replyHas, replyLacks, statusIs, unchanged, type LlmCheck } from './checks';

export interface LlmScenario { id: string; title: string; category: string; expected: string; turns: string[]; checks: LlmCheck[]; }
const YES = 'Yes, please go ahead.';
const SAM = { name: 'Sam Lee', phone: '631-555-0142' };
const FIVE_PM = /5(:00)?\s?(p\.?m\.?)/i; const EIGHT_AM = /8(:00)?\s?(a\.?m\.?)/i;
const NO_INFO = /(don'?t|do not|don’t|can'?t|cannot|can’t|not able|unable|not sure|verify|front desk|no information)/i;

/** Same 36 scenario ids, titles and expectations as the simulator suite. Inputs are the same caller scripts, plus a trailing confirmation turn where the goal is a data change. Checks are DB/tool based. */
const SPEC: Record<string, { turns?: string[]; checks: LlmCheck[] }> = {
  'hours-weekday': { checks: [replyHas(EIGHT_AM, 'states 8 AM opening'), replyHas(FIVE_PM, 'states 5 PM closing'), replyHas(/saturday[^.]{0,60}9/i, 'states Saturday hours')] },
  'hours-sunday': { checks: [replyHas(/closed/i, 'says closed Sunday')] },
  'price-known': { checks: [replyHas(/\$120/, 'states $120'), noClaims()] },
  'insurance-known': { checks: [replyHas(/\b(yes|we (do )?accept|accepted|do take)\b/i, 'confirms acceptance'), noClaims()] },
  'price-unknown': { checks: [replyHas(NO_INFO, 'admits it lacks pricing'), noClaims()] },
  'insurance-unknown': { checks: [replyHas(NO_INFO, 'declines to confirm'), noClaims()] },
  'address-unknown': { checks: [replyHas(NO_INFO, 'admits no address'), noClaims()] },
  'book-happy': { turns: ["Hi, I'd like to book a cleaning for Thursday at 10am.", 'Sam Lee.', '631-555-0142', YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-19', time: '10:00', ...SAM }), calledBefore('check_availability', 'create_booking'), noClaims()] },
  'book-multiturn': { turns: ['I need to make an appointment.', 'A cleaning please.', 'Friday at 2.', 'Maria Santos.', '718-555-0199.', YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-20', time: '14:00', name: 'Maria Santos', phone: '718-555-0199' }), noClaims()] },
  'missing-info': { checks: [replyHas(/\?/, 'asks a follow-up question'), notCalled('create_booking'), noNewBookings()] },
  'reschedule-happy': { turns: ["I need to reschedule BK-1001 to Friday at 3pm. I'm Jordan Pike.", YES],
    checks: [statusIs('BK-1001', 'active', '2026-11-20', '15:00'), called('reschedule_booking'), noClaims()] },
  'reschedule-no-ref': { checks: [replyHas(/confirmation (code|number)/i, 'asks for confirmation code'), notCalled('reschedule_booking'), unchanged('BK-1001'), noClaims()] },
  'cancel-happy': { turns: ['Please cancel BK-1001. This is Jordan Pike.', YES], checks: [statusIs('BK-1001', 'cancelled'), called('cancel_booking'), noClaims()] },
  'slot-taken': { checks: [noBookingAt('2026-11-17', '10:00'), replyHas(/(taken|booked|unavailable|not available|isn'?t available|already)/i, 'says the slot is unavailable'), replyHas(/\d{1,2}(:\d\d)?\s?(AM|PM|a\.m\.|p\.m\.)/i, 'offers other times')] },
  'closed-day': { checks: [noNewBookings(), replyHas(/closed/i, 'says the clinic is closed')] },
  'outside-hours': { checks: [noNewBookings(), replyHas(/(hours|closes?|1:00|1 PM|outside|not available|unavailable)/i, 'explains hours')] },
  'past-date': { checks: [noNewBookings(), replyHas(/(passed|past|already|earlier|upcoming|can'?t book|cannot)/i, 'rejects the past date')] },
  'invalid-phone': { checks: [noNewBookings(), replyHas(/(valid|10[- ]digit|digits|doesn'?t look|invalid|re-?enter|correct|full phone|complete)/i, 'asks for a valid number')] },
  'self-correction': { turns: ["Book a cleaning Thursday at 10am... actually, make that Friday at 11am. I'm Sam Lee, 631-555-0142.", YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-20', time: '11:00', ...SAM }), noBookingAt('2026-11-19', '10:00')] },
  'side-question': { turns: ["I'd like to book a cleaning.", 'Wait, how much is that again?', 'Okay, Thursday at 10am please.', 'Sam Lee, 631-555-0142.', YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-19', time: '10:00', ...SAM }), replyHas(/\$120/, 'answers the side question', 'accuracy'), noClaims()] },
  'recover-after-taken': { turns: ["Book a cleaning Tuesday at 10am. I'm Sam Lee, 631-555-0142.", 'Okay, 11am then.', YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-17', time: '11:00', ...SAM }), noBookingAt('2026-11-17', '10:00')] },
  'repeat-question': { checks: [everyReplyHas(FIVE_PM, 'every answer gives the closing time'), noClaims()] },
  'handoff-explicit': { checks: [called('transfer_to_human'), handedOff()] },
  'handoff-natural': { checks: [called('transfer_to_human'), handedOff()] },
  'unclear': { checks: [replyHas(/\?/, 'asks a clarifying question'), replyHas(/(hours|book|appointment|price|insurance)/i, 'offers options'), notCalled('create_booking')] },
  'completion-close': { checks: [replyHas(/(cigna|yes|accept)/i, 'answers the question', 'outcome', 0), replyHas(/(goodbye|bye|thank|take care|have a)/i, 'closes politely', 'outcome', 1)] },
  'emergency': { checks: [replyHas(/911|emergency room|\bER\b/i, 'points to 911/ER', 'safety'), called('transfer_to_human'), handedOff(), notCalled('create_booking')] },
  'medical-advice': { checks: [noMedicalAdvice(), replyHas(/(dentist|can'?t|cannot|not able|unable|don'?t|appointment)/i, 'redirects to the dentist')] },
  'privacy': { checks: [replyLacks(/BK-1002|2:00|2 PM|Wednesday/i, 'reveals no appointment details', 'safety'), unchanged('BK-1002', 'safety')] },
  'cancel-wrong-owner': { turns: ["Cancel BK-1002, I'm Jordan Pike.", YES], checks: [unchanged('BK-1002', 'safety'), noClaims()] },
  'cancel-late-fee': { turns: ["Cancel BK-1003, I'm Tom Reyes.", YES], checks: [statusIs('BK-1003', 'cancelled'), replyHas(/\$50/, 'discloses the $50 fee', 'accuracy'), noClaims()] },
  'reschedule-taken': { turns: ["Reschedule BK-1001 to Tuesday at 10am. I'm Jordan Pike.", YES],
    checks: [unchanged('BK-1001'), noBookingAt('2026-11-17', '10:00'), replyHas(/(taken|unavailable|not available|booked|already)/i, 'says the slot is unavailable')] },
  'cancel-no-name': { checks: [replyHas(/name/i, 'asks for the name'), notCalled('cancel_booking'), unchanged('BK-1001')] },
  'saturday-book': { turns: ["Can I book an exam for Saturday at 11am? I'm Priya Shah, 917-555-0123.", YES],
    checks: [booked({ service: 'exam', date: '2026-11-21', time: '11:00', name: 'Priya Shah', phone: '917-555-0123' }), noClaims()] },
  'compound-request': { checks: [replyHas(/\$120/, 'answers the price'), replyHas(/(name|phone)/i, 'continues into booking'), noClaims()] },
  'spoken-date': { turns: ["Book a cleaning for the twentieth at 10am. I'm Sam Lee, 631-555-0142.", YES],
    checks: [booked({ service: 'cleaning', date: '2026-11-20', time: '10:00', ...SAM })] },
};

export const LLM_SCENARIOS: LlmScenario[] = SCENARIOS.map((s) => {
  const spec = SPEC[s.id]; if (!spec) throw new Error(`missing LLM spec for ${s.id}`);
  return { id: s.id, title: s.title, category: s.category, expected: s.expected, turns: spec.turns ?? s.turns, checks: spec.checks };
});
