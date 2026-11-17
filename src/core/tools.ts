import type { ToolCall, ToolName, ToolResult } from './types';
import { Booking, SEED_BOOKINGS, HOURS, LATE_FEE, SANDBOX_NOW_MINUTES, SANDBOX_TODAY } from './clinic';
import { fromISO, slotsForDay, toMinutes, weekday, addDays } from './datetime';

/**
 * In-memory sandbox backend with synthetic data. `book_appointment` is a thin write
 * (like a calendar insert): it does NOT re-validate availability. Validation is the
 * agent's job, which is exactly what the evals measure.
 */
export class Sandbox {
  bookings: Booking[];
  log: ToolCall[] = [];
  private seq: number;
  constructor() {
    this.bookings = SEED_BOOKINGS.map((b) => ({ ...b }));
    this.seq = 1006;
  }

  private active(date: string) { return this.bookings.filter((b) => b.status === 'active' && b.date === date); }

  freeSlots(date: string): string[] {
    const taken = new Set(this.active(date).map((b) => b.time));
    return slotsForDay(date).filter((s) => {
      if (taken.has(s)) return false;
      if (date === SANDBOX_TODAY && toMinutes(s) <= SANDBOX_NOW_MINUTES) return false;
      return true;
    });
  }

  invoke(name: ToolName, args: Record<string, unknown>): ToolResult {
    let result: ToolResult;
    try { result = this.run(name, args); }
    catch (e) { result = { ok: false, error: 'INTERNAL', message: String((e as Error).message) }; }
    this.log.push({ name, args, result });
    return result;
  }

  private run(name: ToolName, a: Record<string, unknown>): ToolResult {
    const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '');
    switch (name) {
      case 'check_availability': {
        const date = s('date'); const time = s('time');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'BAD_DATE' };
        if (date < SANDBOX_TODAY) return { ok: true, date, available: false, reason: 'past', freeSlots: [] };
        if (!HOURS[weekday(date)]) return { ok: true, date, available: false, reason: 'closed', freeSlots: [], nextOpenDate: nextOpen(date) };
        const free = this.freeSlots(date);
        if (!time) return { ok: true, date, available: free.length > 0, freeSlots: free };
        if (!slotsForDay(date).includes(time)) return { ok: true, date, time, available: false, reason: 'outside_hours', freeSlots: free };
        if (!free.includes(time)) return { ok: true, date, time, available: false, reason: 'taken', freeSlots: free };
        return { ok: true, date, time, available: true, freeSlots: free };
      }
      case 'book_appointment': {
        for (const k of ['name', 'service', 'date', 'time']) if (!s(k)) return { ok: false, error: 'MISSING_FIELD', field: k };
        const b: Booking = { id: `BK-${this.seq++}`, name: s('name'), phone: s('phone'), service: s('service'), date: s('date'), time: s('time'), status: 'active' };
        this.bookings.push(b);
        return { ok: true, bookingId: b.id, date: b.date, time: b.time, service: b.service };
      }
      case 'reschedule_appointment': {
        const b = this.find(s('bookingId'));
        if (!b || b.status !== 'active') return { ok: false, error: 'NOT_FOUND' };
        if (s('name') && !sameName(s('name'), b.name)) return { ok: false, error: 'NAME_MISMATCH' };
        if (!s('date') || !s('time')) return { ok: false, error: 'MISSING_FIELD' };
        b.date = s('date'); b.time = s('time');
        return { ok: true, bookingId: b.id, date: b.date, time: b.time };
      }
      case 'cancel_appointment': {
        const b = this.find(s('bookingId'));
        if (!b || b.status !== 'active') return { ok: false, error: 'NOT_FOUND' };
        if (s('name') && !sameName(s('name'), b.name)) return { ok: false, error: 'NAME_MISMATCH' };
        const hoursUntil = (toDays(b.date) - toDays(SANDBOX_TODAY)) * 24 + (toMinutes(b.time) - SANDBOX_NOW_MINUTES) / 60;
        b.status = 'cancelled';
        return { ok: true, bookingId: b.id, lateFee: hoursUntil < 24 ? LATE_FEE : 0 };
      }
      case 'validate_phone': {
        const digits = s('phone').replace(/\D/g, '');
        const n = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        if (n.length !== 10 || /^[01]/.test(n)) return { ok: false, error: 'INVALID_PHONE' };
        return { ok: true, normalized: n };
      }
      case 'transfer_to_human':
        return { ok: true, queue: 'front-desk', simulated: true, reason: s('reason') };
      case 'lookup_by_name': {
        const hits = this.bookings.filter((b) => b.status === 'active' && sameName(s('name'), b.name));
        return { ok: true, appointments: hits.map((b) => ({ id: b.id, date: b.date, time: b.time, service: b.service })) };
      }
    }
  }
  private find(id: string) { return this.bookings.find((b) => b.id === id.toUpperCase().replace(/^BK(\d)/, 'BK-$1')); }
}
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const toDays = (iso: string) => Math.round(fromISO(iso).getTime() / 86400000);
function nextOpen(date: string) { let d = date; for (let i = 0; i < 7; i++) { d = addDays(d, 1); if (HOURS[weekday(d)]) return d; } return d; }
