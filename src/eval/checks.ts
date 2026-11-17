import type { Check, CheckCtx, CheckKind } from './types';
import { SEED_BOOKINGS } from '../core/clinic';

const mk = (name: string, kind: CheckKind, run: Check['run']): Check => ({ name, kind, run });
const ok = (detail = 'ok') => ({ pass: true, detail });
const bad = (detail: string) => ({ pass: false, detail });
const digits = (s: string) => s.replace(/\D/g, '');
const newBookings = (c: CheckCtx) => c.sandbox.bookings.filter((b) => Number(b.id.slice(3)) > 1005);

export const say = (re: RegExp, name: string, kind: CheckKind = 'outcome', turn: 'any' | 'last' | number = 'any'): Check =>
  mk(name, kind, (c) => {
    const pool = turn === 'any' ? c.replies : [turn === 'last' ? c.replies[c.replies.length - 1] : c.replies[turn]];
    return pool.some((r) => re.test(r)) ? ok() : bad(`no reply matched ${re}`);
  });
export const notSay = (re: RegExp, name: string, kind: CheckKind = 'accuracy'): Check =>
  mk(name, kind, (c) => { const hit = c.replies.find((r) => re.test(r)); return hit ? bad(`reply matched ${re}: "${hit.slice(0, 120)}"`) : ok(); });
export const everyReply = (re: RegExp, name: string): Check =>
  mk(name, 'accuracy', (c) => c.replies.every((r) => re.test(r)) ? ok() : bad(`not every reply matched ${re}`));
export const called = (tool: string, name = `calls ${tool}`): Check =>
  mk(name, 'tool', (c) => c.calls.some((x) => x.name === tool) ? ok() : bad(`${tool} was never called`));
export const notCalled = (tool: string, name = `does not call ${tool}`): Check =>
  mk(name, 'tool', (c) => c.calls.some((x) => x.name === tool) ? bad(`${tool} was called`) : ok());
export const calledBefore = (a: string, b: string): Check =>
  mk(`calls ${a} before ${b}`, 'tool', (c) => {
    const ib = c.calls.findIndex((x) => x.name === b);
    if (ib < 0) return bad(`${b} never called`);
    return c.calls.slice(0, ib).some((x) => x.name === a) ? ok() : bad(`${b} was called without a prior ${a}`);
  });
export const noIncidents = (): Check =>
  mk('no unsupported claims', 'accuracy', (c) => c.incidents.length ? bad(c.incidents.map((i) => `${i.type}: ${i.evidence}`).join('; ')) : ok());
export const handedOff = (): Check => mk('transfers to human', 'outcome', (c) => c.state.handedOff ? ok() : bad('no transfer happened'));
export const closedCall = (): Check => mk('ends the call politely', 'outcome', (c) => c.state.closed ? ok() : bad('call was not closed'));
export const noNewBookings = (): Check =>
  mk('creates no appointment', 'accuracy', (c) => { const n = newBookings(c); return n.length ? bad(`created ${n.map((b) => `${b.id} ${b.date} ${b.time}`).join(', ')}`) : ok(); });
export const booked = (want: { service: string; date: string; time: string; name: string; phone?: string }): Check =>
  mk(`books ${want.service} ${want.date} ${want.time}`, 'outcome', (c) => {
    const hit = newBookings(c).find((b) => b.service === want.service && b.date === want.date && b.time === want.time && b.name === want.name
      && (!want.phone || digits(b.phone) === digits(want.phone)));
    return hit ? ok(hit.id) : bad(`no matching booking; created: ${newBookings(c).map((b) => `${b.date} ${b.time} phone="${b.phone}"`).join(' | ') || 'none'}`);
  });
export const noBookingAt = (date: string, time: string): Check =>
  mk(`no booking at ${date} ${time}`, 'accuracy', (c) => {
    const seeded = SEED_BOOKINGS.filter((b) => b.date === date && b.time === time).length;
    const n = c.sandbox.bookings.filter((b) => b.status === 'active' && b.date === date && b.time === time).length;
    return n > seeded ? bad(`${n} active bookings at a slot that already had ${seeded}`) : ok();
  });
export const bookingIs = (id: string, status: 'active' | 'cancelled', date?: string, time?: string): Check =>
  mk(`${id} is ${status}${date ? ` on ${date} ${time}` : ''}`, 'outcome', (c) => {
    const b = c.sandbox.bookings.find((x) => x.id === id);
    if (!b) return bad('booking missing');
    if (b.status !== status) return bad(`status is ${b.status}`);
    if (date && (b.date !== date || b.time !== time)) return bad(`now ${b.date} ${b.time}`);
    return ok();
  });
export const bookingUntouched = (id: string): Check =>
  mk(`${id} left unchanged`, 'accuracy', (c) => {
    const s = SEED_BOOKINGS.find((x) => x.id === id)!; const b = c.sandbox.bookings.find((x) => x.id === id)!;
    return b.status === s.status && b.date === s.date && b.time === s.time ? ok() : bad(`changed to ${b.status} ${b.date} ${b.time}`);
  });
