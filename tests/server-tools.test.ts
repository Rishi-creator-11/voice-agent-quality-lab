import { describe, expect, it } from 'vitest';
import { createClinicDb, handoffs, snapshot } from '../server/db';
import { ClinicBackend } from '../server/tools';

const mk = () => { const db = createClinicDb(); return { db, be: new ClinicBackend(db) }; };
const book = { full_name: 'Sam Lee', phone: '631-555-0142', service: 'cleaning', date: '2026-11-19', time: '10:00' };

describe('backend tools (real SQLite)', () => {
  it('creates a booking that persists in the database', () => {
    const { db, be } = mk();
    const r = be.execute('create_booking', book);
    expect(r).toMatchObject({ ok: true, confirmation_code: 'BK-1006' });
    expect(snapshot(db).find((b) => b.code === 'BK-1006')).toMatchObject({ date: '2026-11-19', time: '10:00', status: 'active', phone: '6315550142' });
  });
  it('refuses a taken, closed, outside-hours or past slot', () => {
    const { be, db } = mk();
    for (const [d, t, why] of [['2026-11-17', '10:00', 'taken'], ['2026-11-22', '10:00', 'closed'], ['2026-11-21', '15:00', 'outside_hours'], ['2026-11-15', '10:00', 'past']] as const)
      expect(be.execute('create_booking', { ...book, date: d, time: t })).toMatchObject({ ok: false, error: 'SLOT_UNAVAILABLE', reason: why });
    expect(snapshot(db).length).toBe(5);
  });
  it('database constraint blocks double booking even if app logic is bypassed', () => {
    const { db } = mk();
    expect(() => db.prepare("INSERT INTO bookings VALUES ('BK-9','X Y','Y','5555550100','exam','2026-11-17','10:00','active',99)").run()).toThrow(/UNIQUE/);
  });
  it('is idempotent by request_id and by identical details', () => {
    const { be, db } = mk();
    const a = be.execute('create_booking', { ...book, request_id: 'r1' });
    const b = be.execute('create_booking', { ...book, request_id: 'r1' });
    const c = be.execute('create_booking', book);
    expect(b).toMatchObject({ confirmation_code: a.confirmation_code, replayed: true });
    expect(c).toMatchObject({ confirmation_code: a.confirmation_code, replayed: true });
    expect(snapshot(db).length).toBe(6);
  });
  it('validates input and rejects unknown fields', () => {
    const { be } = mk();
    expect(be.execute('create_booking', { ...book, phone: '12345' })).toMatchObject({ ok: false, error: 'INVALID_CUSTOMER' });
    expect(be.execute('create_booking', { ...book, full_name: 'Sam' })).toMatchObject({ ok: false, error: 'INVALID_CUSTOMER' });
    expect(be.execute('create_booking', { ...book, date: 'next friday' })).toMatchObject({ ok: false, error: 'VALIDATION' });
    expect(be.execute('create_booking', { ...book, extra: 1 })).toMatchObject({ ok: false, error: 'VALIDATION' });
    expect(be.execute('drop_tables', {})).toMatchObject({ ok: false, error: 'UNKNOWN_TOOL' });
  });
  it('never resolves prototype keys as tools and never throws', () => {
    const { be } = mk();
    for (const t of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'execute', 'tx'])
      expect(be.execute(t, {})).toMatchObject({ ok: false, error: 'UNKNOWN_TOOL' });
  });
  it('requires code + last name; wrong owner and unknown code look identical', () => {
    const { be, db } = mk();
    const wrong = be.execute('cancel_booking', { confirmation_code: 'BK-1002', last_name: 'Pike' });
    const unknown = be.execute('cancel_booking', { confirmation_code: 'BK-4040', last_name: 'Pike' });
    expect(wrong).toEqual(unknown);
    expect(snapshot(db).find((b) => b.code === 'BK-1002')!.status).toBe('active');
    expect(be.execute('lookup_booking', { confirmation_code: 'bk1002', last_name: 'gomez' })).toMatchObject({ ok: true });
  });
  it('reschedule moves the booking and respects availability', () => {
    const { be, db } = mk();
    expect(be.execute('reschedule_booking', { confirmation_code: 'BK-1001', last_name: 'Pike', new_date: '2026-11-17', new_time: '10:00' })).toMatchObject({ ok: false, reason: 'taken' });
    expect(be.execute('reschedule_booking', { confirmation_code: 'BK-1001', last_name: 'Pike', new_date: '2026-11-20', new_time: '15:00' })).toMatchObject({ ok: true });
    expect(snapshot(db).find((b) => b.code === 'BK-1001')).toMatchObject({ date: '2026-11-20', time: '15:00' });
  });
  it('cancel frees the slot and reports the late fee', () => {
    const { be } = mk();
    expect(be.execute('cancel_booking', { confirmation_code: 'BK-1003', last_name: 'Reyes' })).toMatchObject({ ok: true, late_fee: 50 });
    expect(be.execute('create_booking', { ...book, date: '2026-11-17', time: '08:30' })).toMatchObject({ ok: true });
  });
  it('records handoffs and audits every call; sessions are isolated', () => {
    const { be, db } = mk(); const other = mk();
    be.execute('transfer_to_human', { reason: 'emergency' });
    expect(handoffs(db)).toEqual(['emergency']); expect(handoffs(other.db)).toEqual([]);
    expect((db.prepare('SELECT COUNT(*) n FROM audit').get() as { n: number }).n).toBe(1);
  });
});
