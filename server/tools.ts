import { z } from 'zod';
import { HOURS, LATE_FEE, SANDBOX_NOW_MINUTES, SANDBOX_TODAY, SERVICES } from '../src/core/clinic';
import { addDays, fromISO, slotsForDay, toMinutes, weekday } from '../src/core/datetime';
import type { BookingRow, Db } from './db';

export type ToolResult = { ok: boolean; [k: string]: unknown };
const SERVICE_KEYS = Object.keys(SERVICES) as [string, ...string[]];

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM 24h');
const code = z.string().trim().transform((s) => s.toUpperCase().replace(/^BK-?/, 'BK-')).pipe(z.string().regex(/^BK-\d{4}$/, 'format BK-1234'));
const name = z.string().trim().min(2).max(60).regex(/^[A-Za-z][A-Za-z' -]*$/, 'letters only');
const phone = z.string().trim().max(30);
const reason = z.string().trim().min(1).max(200);

export const SCHEMAS = {
  check_availability: z.object({ date, time: time.optional() }).strict(),
  validate_customer: z.object({ full_name: z.string().max(80), phone: phone }).strict(),
  create_booking: z.object({ full_name: name, phone, service: z.enum(SERVICE_KEYS), date, time, request_id: z.string().max(64).optional() }).strict(),
  lookup_booking: z.object({ confirmation_code: code, last_name: name }).strict(),
  reschedule_booking: z.object({ confirmation_code: code, last_name: name, new_date: date, new_time: time }).strict(),
  cancel_booking: z.object({ confirmation_code: code, last_name: name }).strict(),
  transfer_to_human: z.object({ reason }).strict(),
} as const;
export type ToolName = keyof typeof SCHEMAS;
export const TOOL_NAMES = Object.keys(SCHEMAS) as ToolName[];

const normPhone = (p: string) => { const d = p.replace(/\D/g, ''); const n = d.length === 11 && d.startsWith('1') ? d.slice(1) : d; return n.length === 10 && !/^[01]/.test(n) ? n : null; };
const hoursUntil = (d: string, t: string) => (Math.round(fromISO(d).getTime() / 864e5) - Math.round(fromISO(SANDBOX_TODAY).getTime() / 864e5)) * 24 + (toMinutes(t) - SANDBOX_NOW_MINUTES) / 60;

/** Executes tool calls against the clinic DB. The model proposes; this code validates, authorizes and mutates. */
export class ClinicBackend {
  constructor(private db: Db) {}

  execute(tool: string, raw: unknown): ToolResult {
    let result: ToolResult;
    const schema = (SCHEMAS as Record<string, z.ZodTypeAny>)[tool];
    if (!schema) result = { ok: false, error: 'UNKNOWN_TOOL' };
    else {
      const p = schema.safeParse(raw ?? {});
      if (!p.success) result = { ok: false, error: 'VALIDATION', issues: p.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`) };
      else {
        try { result = (this[tool as ToolName] as (a: never) => ToolResult)(p.data as never); }
        catch (e) { result = { ok: false, error: 'INTERNAL', message: (e as Error).message }; }
      }
    }
    this.db.prepare('INSERT INTO audit(tool, ok, detail) VALUES (?,?,?)').run(tool, result.ok ? 1 : 0, result.ok ? '' : String(result.error));
    return result;
  }

  private free(d: string): string[] {
    const taken = new Set((this.db.prepare("SELECT time FROM bookings WHERE date=? AND status='active'").all(d) as { time: string }[]).map((r) => r.time));
    return slotsForDay(d).filter((s) => !taken.has(s) && !(d === SANDBOX_TODAY && toMinutes(s) <= SANDBOX_NOW_MINUTES));
  }
  /** Why a slot cannot be booked, or null if it is bookable. */
  private slotProblem(d: string, t: string): ToolResult | null {
    if (d < SANDBOX_TODAY) return { ok: true, available: false, reason: 'past', freeSlots: [] };
    if (!HOURS[weekday(d)]) { let n = d; for (let i = 0; i < 7; i++) { n = addDays(n, 1); if (HOURS[weekday(n)]) break; } return { ok: true, available: false, reason: 'closed', freeSlots: [], nextOpenDate: n }; }
    if (!slotsForDay(d).includes(t)) return { ok: true, available: false, reason: 'outside_hours', freeSlots: this.free(d) };
    if (!this.free(d).includes(t)) return { ok: true, available: false, reason: 'taken', freeSlots: this.free(d) };
    return null;
  }

  check_availability({ date: d, time: t }: { date: string; time?: string }): ToolResult {
    if (!t) { if (d < SANDBOX_TODAY) return { ok: true, date: d, available: false, reason: 'past', freeSlots: [] }; const f = this.free(d); return { ok: true, date: d, available: f.length > 0, reason: HOURS[weekday(d)] ? '' : 'closed', freeSlots: f }; }
    const p = this.slotProblem(d, t);
    return { date: d, time: t, ...(p ?? { ok: true, available: true, freeSlots: this.free(d) }) };
  }

  validate_customer({ full_name, phone: ph }: { full_name: string; phone: string }): ToolResult {
    const problems: string[] = [];
    if (!/^[A-Za-z][A-Za-z'-]+(?: [A-Za-z][A-Za-z'-]+)+$/.test(full_name.trim())) problems.push('full_name must include first and last name (letters only)');
    const n = normPhone(ph); if (!n) problems.push('phone must be a valid 10-digit US number');
    return problems.length ? { ok: false, error: 'INVALID_CUSTOMER', problems } : { ok: true, phone: n, last_name: full_name.trim().split(' ').pop() };
  }

  create_booking(a: { full_name: string; phone: string; service: string; date: string; time: string; request_id?: string }): ToolResult {
    const v = this.validate_customer({ full_name: a.full_name, phone: a.phone });
    if (!v.ok) return v;
    return this.tx(() => {
      if (a.request_id) { const r = this.db.prepare('SELECT result FROM idempotency WHERE key=?').get(a.request_id) as { result: string } | undefined; if (r) return { ...JSON.parse(r.result), replayed: true }; }
      const dup = this.db.prepare("SELECT * FROM bookings WHERE status='active' AND lower(full_name)=lower(?) AND phone=? AND date=? AND time=?").get(a.full_name, v.phone, a.date, a.time) as BookingRow | undefined;
      if (dup) return { ok: true, confirmation_code: dup.code, date: dup.date, time: dup.time, service: dup.service, replayed: true };
      const p = this.slotProblem(a.date, a.time);
      if (p) return { ok: false, error: 'SLOT_UNAVAILABLE', reason: p.reason, freeSlots: p.freeSlots };
      const seq = Number((this.db.prepare("SELECT result FROM idempotency WHERE key='__seq__'").get() as { result: string }).result) + 1;
      this.db.prepare("UPDATE idempotency SET result=? WHERE key='__seq__'").run(String(seq));
      const c = `BK-${seq}`;
      this.db.prepare("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,'active',?)").run(c, a.full_name, a.full_name.trim().split(' ').pop(), v.phone, a.service, a.date, a.time, seq);
      const res: ToolResult = { ok: true, confirmation_code: c, date: a.date, time: a.time, service: a.service };
      if (a.request_id) this.db.prepare('INSERT INTO idempotency VALUES (?,?)').run(a.request_id, JSON.stringify(res));
      return res;
    });
  }

  /** Same response for unknown code and wrong name, so codes cannot be probed. */
  private authorized(c: string, last: string): BookingRow | null {
    const b = this.db.prepare("SELECT * FROM bookings WHERE code=? AND status='active'").get(c) as BookingRow | undefined;
    return b && b.last_name.toLowerCase() === last.trim().toLowerCase() ? b : null;
  }

  lookup_booking(a: { confirmation_code: string; last_name: string }): ToolResult {
    const b = this.authorized(a.confirmation_code, a.last_name);
    return b ? { ok: true, booking: { confirmation_code: b.code, service: b.service, date: b.date, time: b.time } } : { ok: false, error: 'NOT_FOUND_OR_MISMATCH' };
  }

  reschedule_booking(a: { confirmation_code: string; last_name: string; new_date: string; new_time: string }): ToolResult {
    return this.tx(() => {
      const b = this.authorized(a.confirmation_code, a.last_name); if (!b) return { ok: false, error: 'NOT_FOUND_OR_MISMATCH' };
      if (b.date === a.new_date && b.time === a.new_time) return { ok: true, confirmation_code: b.code, date: b.date, time: b.time, unchanged: true };
      const p = this.slotProblem(a.new_date, a.new_time);
      if (p) return { ok: false, error: 'SLOT_UNAVAILABLE', reason: p.reason, freeSlots: p.freeSlots };
      this.db.prepare('UPDATE bookings SET date=?, time=? WHERE code=?').run(a.new_date, a.new_time, b.code);
      return { ok: true, confirmation_code: b.code, date: a.new_date, time: a.new_time };
    });
  }

  cancel_booking(a: { confirmation_code: string; last_name: string }): ToolResult {
    return this.tx(() => {
      const b = this.authorized(a.confirmation_code, a.last_name); if (!b) return { ok: false, error: 'NOT_FOUND_OR_MISMATCH' };
      this.db.prepare("UPDATE bookings SET status='cancelled' WHERE code=?").run(b.code);
      return { ok: true, confirmation_code: b.code, late_fee: hoursUntil(b.date, b.time) < 24 ? LATE_FEE : 0 };
    });
  }

  transfer_to_human(a: { reason: string }): ToolResult {
    this.db.prepare('INSERT INTO handoffs(reason) VALUES (?)').run(a.reason);
    return { ok: true, queue: 'front-desk', simulated: true };
  }

  private tx<T>(fn: () => T): T { return this.db.transaction(fn).immediate(); }
}
