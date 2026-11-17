import type { AgentConfig, ToolCall, ToolName, ToolResult } from './types';
import { Sandbox } from './tools';
import {
  CANCEL_POLICY, CLINIC, HOURS, HOURS_TEXT, INSURANCE_ACCEPTED, INSURANCE_OTHERS, LATE_FEE,
  SANDBOX_TODAY, SERVICES, UNPRICED, UNPRICED_LABEL,
} from './clinic';
import { dayName, parseDate, parseTime, prettyDate, prettyTime, weekday } from './datetime';

type Slot = 'service' | 'date' | 'time' | 'name' | 'phone' | 'bookingId';
type Flow = null | 'book' | 'reschedule' | 'cancel';
export interface AgentState {
  flow: Flow; slots: Partial<Record<Slot, string>>; awaiting?: Slot;
  closed: boolean; handedOff: boolean; done: boolean;
}
export interface AgentReply { reply: string; toolCalls: ToolCall[]; ms: number; }

const EMERGENCY = /knocked[- ]out|bleeding (badly|heavily|a lot)|won'?t stop bleeding|can'?t (breathe|swallow)|swelling.*(face|throat|eye|neck)|face.*swollen|severe pain|broken jaw|abscess|facial trauma/;
const PRIVACY = /\b[A-Z][a-z]+ [A-Z][a-z]+'s (appointment|booking)|(appointment|booking) (for|under) [A-Z][a-z]+ [A-Z][a-z]+/;
const MEDICAL = /ibuprofen|tylenol|acetaminophen|advil|painkiller|antibiotic|medication|medicine|dosage|how many (mg|pills)|should i take/;
const TYPICAL: Record<string, string> = { 'root canal': '$700–$1,500', crown: '$800–$1,400', braces: '$3,000–$7,000', implant: '$3,000–$4,500', extraction: '$150–$400' };

export class Agent {
  state: AgentState = { flow: null, slots: {}, closed: false, handedOff: false, done: false };
  constructor(public cfg: AgentConfig, public sandbox: Sandbox) {}

  respond(text: string): AgentReply {
    const t0 = performance.now();
    const calls: ToolCall[] = [];
    const call = (name: ToolName, args: Record<string, unknown>): ToolResult => {
      const r = this.sandbox.invoke(name, args);
      calls.push({ name, args, result: r });
      return r;
    };
    const reply = this.route(text, call);
    return { reply, toolCalls: calls, ms: performance.now() - t0 };
  }

  // ---------------------------------------------------------------- routing
  private route(text: string, call: (n: ToolName, a: Record<string, unknown>) => ToolResult): string {
    const cfg = this.cfg; const st = this.state; const t = text.toLowerCase();
    if (st.closed) return 'This call has ended. Thank you for calling.';

    if (cfg.emergencyProtocol && EMERGENCY.test(t)) {
      call('transfer_to_human', { reason: 'dental emergency' });
      st.handedOff = true; st.done = true;
      return 'That sounds urgent. If you are having trouble breathing or swallowing, have swelling spreading to your face or neck, or bleeding that will not stop, please call 911 or go to the nearest emergency room right now. I am also transferring you to our front desk team.';
    }
    const wantsHuman = cfg.handoffTriggers === 'broad'
      ? /\bhuman\b|real person|\bperson\b|representative|front desk|receptionist|operator|manager|someone (at|from|in)|speak (to|with)|talk to (a |an )?(someone|somebody|person|rep)|\bsomeone\b/.test(t)
      : /\bhuman\b/.test(t);
    if (wantsHuman) {
      call('transfer_to_human', { reason: 'caller requested a person' });
      st.handedOff = true; st.done = true;
      return 'Of course. I am transferring you to our front desk team now.';
    }
    if (cfg.privacyGuardrail && PRIVACY.test(text)) {
      return 'I am not able to share information about other patients. If you would like to manage your own appointment, I just need your confirmation number and the name on the appointment.';
    }
    if (!cfg.privacyGuardrail && PRIVACY.test(text)) {
      const m = text.match(/([A-Z][a-z]+ [A-Z][a-z]+)/);
      const r = call('lookup_by_name', { name: m ? m[1] : '' });
      const hit = (r.appointments as { id: string; date: string; time: string; service: string }[] | undefined)?.[0];
      return hit ? `${m![1]} has a ${hit.service} on ${prettyDate(hit.date)} at ${prettyTime(hit.time)} (${hit.id}).` : 'I could not find an appointment under that name.';
    }
    if (MEDICAL.test(t)) {
      return cfg.medicalAdviceGuardrail
        ? 'I am not able to give medical advice or medication recommendations. A dentist should look at that, and I can help you book a visit if you like.'
        : 'For a toothache you can take over-the-counter ibuprofen, 400 mg every 6 hours with food. Would you like to book an appointment?';
    }
    if (/^(no,? )?(thanks|thank you|that'?s (all|it)|bye|goodbye|nothing else|no thanks|no,? that'?s)/.test(t.trim()) && !/\d/.test(t)) {
      st.closed = true; st.done = true;
      return `You're welcome. Thank you for calling ${CLINIC.name}. Goodbye.`;
    }

    const intent: Flow = /cancel/.test(t) ? 'cancel'
      : /reschedul|move (my|the|it)|change (my|the) (appointment|time|date)|push (it|my)/.test(t) ? 'reschedule'
      : /book|schedul|appointment|appt|come in|see (the |a )?dentist|reserve/.test(t) ? 'book'
      : /\b(i'?d like|i want|i need|can i (get|have)|get me|looking for)\b/.test(t) && (Object.values(SERVICES).some((v) => v.words.test(t)) || parseDate(text) || parseTime(text, true)) ? 'book' : null;
    const info = this.answerInfo(t, text);
    if (info !== null) {
      if (cfg.handleCompound && intent === 'book' && !st.flow) {
        st.flow = 'book'; st.slots = {}; this.extract(text);
        return `${info} ${this.bookStep(call)}`;
      }
      if (st.flow && !cfg.keepStateOnSideQuestion) { st.flow = null; st.slots = {}; st.awaiting = undefined; return info; }
      if (st.flow) { const p = this.nextPrompt(); return p ? `${info} ${p}` : info; }
      return info;
    }

    if (intent && intent !== st.flow) { st.flow = intent; st.slots = {}; st.awaiting = undefined; }
    if (!st.flow) {
      if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.split(/\s+/).length <= 4)
        return `Thank you for calling ${CLINIC.name}. How can I help you today?`;
      return cfg.clarifyUnclear
        ? 'I want to make sure I help with the right thing. I can tell you our hours, prices and accepted insurance, or book, reschedule or cancel an appointment. Which would you like?'
        : 'I would be happy to help. Would you like to book an appointment?';
    }
    this.extract(text);
    if (st.flow === 'book') return this.bookStep(call);
    if (st.flow === 'reschedule') return this.rescheduleStep(call);
    return this.cancelStep(call);
  }

  // ------------------------------------------------------------ extraction
  private extract(text: string) {
    const st = this.state; const cfg = this.cfg; const t = text.toLowerCase(); const s = st.slots;
    const last = cfg.selfCorrection;
    for (const [k, v] of Object.entries(SERVICES)) if (v.words.test(t)) { s.service = k; break; }
    const d = parseDate(text, SANDBOX_TODAY, last); if (d) s.date = d.iso;
    const tm = parseTime(text, cfg.resolveAmbiguousTimes, last); if (tm) s.time = tm;
    const id = text.match(/bk-?(\d{4})/i); if (id) s.bookingId = `BK-${id[1]}`;
    const nm = text.match(/(?:[Mm]y name is|I'm|I am|[Tt]his is|[Ii]t's|[Nn]ame's|under)\s+([A-Z][a-z'-]+(?: [A-Z][a-z'-]+)?)/)
      || text.match(/^([A-Z][a-z'-]+ [A-Z][a-z'-]+)\b/);
    if (nm && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|November|December|Next|Book|Cancel|Move)/.test(nm[1])) s.name = nm[1];
    else if (st.awaiting === 'name' && /^[A-Za-z' -]{2,40}$/.test(text.trim())) s.name = text.trim();
    const full = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const kw = text.match(/phone(?: number)?(?: is)?:?\s*([\d\s().+-]{3,})/i);
    if (full) s.phone = full[0]; else if (kw) s.phone = kw[1].trim();
    else if (st.awaiting === 'phone' && /^[\d\s().+-]{3,}$/.test(text.trim())) s.phone = text.trim();
  }

  private fieldPrompt(f: Slot): string {
    switch (f) {
      case 'service': return 'What would you like to come in for: a cleaning, exam, X-rays, whitening, or a filling?';
      case 'date': return 'What day works for you?';
      case 'time': return 'What time would you like?';
      case 'name': return 'May I have your full name?';
      case 'phone': return 'And what is the best phone number for you?';
      case 'bookingId': return 'What is your confirmation number? It starts with BK followed by four digits.';
    }
  }
  private required(): Slot[] {
    const st = this.state;
    if (st.flow === 'book') return this.cfg.requiredFields;
    const ref: Slot[] = this.cfg.requireVerifiedRef ? ['bookingId', 'name'] : ['bookingId'];
    return st.flow === 'reschedule' ? [...ref, 'date', 'time'] : ref;
  }
  private nextPrompt(): string {
    const miss = this.required().find((f) => !this.state.slots[f]);
    if (!miss) return '';
    this.state.awaiting = miss; return this.fieldPrompt(miss);
  }

  // ------------------------------------------------------------------ book
  private bookStep(call: (n: ToolName, a: Record<string, unknown>) => ToolResult): string {
    const st = this.state; const cfg = this.cfg; const s = st.slots;
    const p = this.nextPrompt(); if (p) return p;
    if (cfg.validatePhone) {
      const v = call('validate_phone', { phone: s.phone });
      if (!v.ok) { s.phone = undefined; st.awaiting = 'phone'; return 'That phone number does not look valid. Could you give me a 10-digit number?'; }
    }
    if (cfg.rejectPastDates && s.date! < SANDBOX_TODAY) {
      s.date = undefined; st.awaiting = 'date'; return 'That date has already passed. What upcoming day works for you?';
    }
    if (cfg.checkAvailabilityBeforeBook) {
      const r = call('check_availability', { date: s.date, time: s.time });
      if (!r.available) return this.unavailable(r);
    }
    const b = call('book_appointment', { name: s.name, phone: s.phone ?? '', service: s.service, date: s.date, time: s.time });
    if (!b.ok) return 'I am sorry, something went wrong while booking. Let me transfer you to our front desk.';
    const label = SERVICES[s.service!]?.label ?? s.service;
    st.flow = null; st.slots = {}; st.awaiting = undefined; st.done = true;
    return `You're booked for a ${label} on ${prettyDate(b.date as string)} at ${prettyTime(b.time as string)}. Your confirmation number is ${b.bookingId}. Is there anything else I can help with?`;
  }

  private unavailable(r: ToolResult): string {
    const s = this.state.slots;
    if (r.reason === 'closed') {
      const nd = r.nextOpenDate as string; s.date = undefined; s.time = undefined; this.state.awaiting = 'date';
      return `We are closed on ${dayName(r.date as string)}s. ${HOURS_TEXT} The next day we are open is ${prettyDate(nd)}. Would you like a time then?`;
    }
    const free = (r.freeSlots as string[]).slice(0, 3).map(prettyTime);
    if (r.reason === 'past') { s.date = undefined; this.state.awaiting = 'date'; return 'That date has already passed. What upcoming day works for you?'; }
    s.time = undefined; this.state.awaiting = 'time';
    if (r.reason === 'outside_hours') {
      return `${prettyTime(r.time as string)} is outside our hours that day. ${HOURS_TEXT}${free.length ? ` Open times include ${free.join(', ')}.` : ''} What time would you like?`;
    }
    return `${prettyTime(r.time as string)} on ${prettyDate(r.date as string)} is already taken.${free.length ? ` Available times that day include ${free.join(', ')}.` : ''} Which would you prefer?`;
  }

  // ------------------------------------------------------------ reschedule
  private rescheduleStep(call: (n: ToolName, a: Record<string, unknown>) => ToolResult): string {
    const st = this.state; const cfg = this.cfg; const s = st.slots;
    if (!cfg.requireVerifiedRef && !s.bookingId && s.date) {
      // Version A behaviour: claims the change without any tool call.
      st.flow = null; st.done = true;
      return `No problem, I have moved your appointment to ${prettyDate(s.date)}${s.time ? ` at ${prettyTime(s.time)}` : ''}.`;
    }
    const p = this.nextPrompt(); if (p) return p;
    if (cfg.checkAvailabilityBeforeBook) {
      const r = call('check_availability', { date: s.date, time: s.time });
      if (!r.available) return this.unavailable(r);
    }
    const r = call('reschedule_appointment', { bookingId: s.bookingId, name: cfg.requireVerifiedRef ? s.name : undefined, date: s.date, time: s.time });
    if (!r.ok) {
      s.bookingId = undefined; st.flow = null;
      return 'I could not verify that confirmation number with that name, so I am not able to change it. I can transfer you to our front desk if you would like.';
    }
    st.flow = null; st.slots = {}; st.done = true;
    return `Done. Appointment ${r.bookingId} is now on ${prettyDate(r.date as string)} at ${prettyTime(r.time as string)}. Anything else?`;
  }

  // ---------------------------------------------------------------- cancel
  private cancelStep(call: (n: ToolName, a: Record<string, unknown>) => ToolResult): string {
    const st = this.state; const cfg = this.cfg; const s = st.slots;
    const p = this.nextPrompt(); if (p) return p;
    const r = call('cancel_appointment', { bookingId: s.bookingId, name: cfg.requireVerifiedRef ? s.name : undefined });
    if (!r.ok) {
      s.bookingId = undefined; st.flow = null;
      return 'I could not verify that confirmation number with that name, so I am not able to cancel it. I can transfer you to our front desk if you would like.';
    }
    st.flow = null; st.slots = {}; st.done = true;
    const fee = cfg.disclosePolicy && (r.lateFee as number) > 0
      ? ` Because this is less than 24 hours’ notice, our $${LATE_FEE} late-cancellation fee applies.` : '';
    return `Your appointment ${r.bookingId} has been cancelled.${fee} Is there anything else?`;
  }

  // ------------------------------------------------------------------ info
  private answerInfo(t: string, original: string): string | null {
    const cfg = this.cfg; const slots = this.state.slots;
    if (/cancell?ation (policy|fee)|late (cancel|fee)|cancel.*policy/.test(t)) return CANCEL_POLICY;
    if (/\bhours\b|\bopen\b|\bclose\b|closing time|what time do you/.test(t)) {
      const d = parseDate(original);
      if (d) {
        const closed = !HOURS[weekday(d.iso)];
        return `${closed ? 'No, we are closed' : 'Yes, we are open'} on ${dayName(d.iso)}s. ${HOURS_TEXT}`;
      }
      return HOURS_TEXT;
    }
    if (/how much|\bcost\b|\bprice|\bcharge\b|\bfee\b/.test(t)) {
      let key = Object.keys(SERVICES).find((k) => SERVICES[k].words.test(t));
      const un = Object.keys(UNPRICED_LABEL).find((k) => t.includes(k));
      if (!key && !un && slots.service && /\b(that|it|this)\b/.test(t)) key = slots.service;
      if (key) return `A ${SERVICES[key].label} is $${SERVICES[key].price}.`;
      if (un) {
        const label = UNPRICED_LABEL[un];
        return cfg.groundedAnswers
          ? `I do not have pricing for a ${label} in the information I can access, and I would rather not guess. I can connect you with our front desk for an accurate quote.`
          : `A ${label} typically runs around ${TYPICAL[un] ?? '$500–$1,000'}.`;
      }
      return 'Which service would you like pricing for: cleaning, exam, X-rays, whitening, or a filling?';
    }
    if (/insurance|delta|aetna|cigna|metlife|guardian|united ?healthcare|humana|medicaid|anthem|coverage/.test(t)) {
      const ok = INSURANCE_ACCEPTED.find((i) => t.includes(i.toLowerCase()));
      const other = INSURANCE_OTHERS.find((i) => t.includes(i.toLowerCase()));
      if (ok) return `Yes, we accept ${ok}.`;
      if (!cfg.groundedAnswers) return `Yes, we accept most major dental insurance plans${other ? `, including ${other}` : ''}.`;
      return `I am not able to confirm ${other ?? 'that plan'}. The plans I can confirm are ${INSURANCE_ACCEPTED.join(', ')}. Our front desk can verify other plans for you.`;
    }
    if (/where are you|address|located|location|directions/.test(t)) {
      return cfg.groundedAnswers
        ? 'I do not have our street address in the information I can access. I can transfer you to the front desk, who can give you directions.'
        : 'We are located at 123 Main Street, Springfield, next to the pharmacy.';
    }
    if (/what services|which services|do you (offer|do)\b|services/.test(t))
      return `We offer ${Object.values(SERVICES).map((s) => s.label).join(', ')}.`;
    return null;
  }
}
