import { describe, expect, it } from 'vitest';
import { parseDate, parseTime, slotsForDay } from '../src/core/datetime';
import { Sandbox } from '../src/core/tools';

describe('datetime', () => {
  it('parses weekdays relative to the sandbox Monday', () => {
    expect(parseDate('Thursday at 10')?.iso).toBe('2026-11-19');
    expect(parseDate('tomorrow')?.iso).toBe('2026-11-17');
    expect(parseDate('yesterday')?.iso).toBe('2026-11-15');
    expect(parseDate('november 20th')?.iso).toBe('2026-11-20');
    expect(parseDate('the twentieth')?.iso).toBe('2026-11-20');
    expect(parseDate('the first')?.iso).toBe('2026-12-01');
    expect(parseDate('no date here')).toBeNull();
  });
  it('last=true picks the correction', () => {
    expect(parseDate('Thursday, actually Friday', undefined, true)?.iso).toBe('2026-11-20');
    expect(parseTime('at 10... make that 11am', false, true)).toBe('11:00');
  });
  it('resolves bare hours only when asked', () => {
    expect(parseTime('Friday at 2', true)).toBe('14:00');
    expect(parseTime('Friday at 2', false)).toBe('02:00');
    expect(parseTime('2:30pm', false)).toBe('14:30');
  });
  it('generates 30-minute slots within hours', () => {
    expect(slotsForDay('2026-11-21')).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
    expect(slotsForDay('2026-11-22')).toEqual([]);
  });
});

describe('sandbox tools', () => {
  it('reports taken, closed, outside-hours and past', () => {
    const s = new Sandbox();
    expect(s.invoke('check_availability', { date: '2026-11-17', time: '10:00' })).toMatchObject({ available: false, reason: 'taken' });
    expect(s.invoke('check_availability', { date: '2026-11-22', time: '10:00' })).toMatchObject({ available: false, reason: 'closed' });
    expect(s.invoke('check_availability', { date: '2026-11-21', time: '15:00' })).toMatchObject({ available: false, reason: 'outside_hours' });
    expect(s.invoke('check_availability', { date: '2026-11-15' })).toMatchObject({ available: false, reason: 'past' });
    expect(s.invoke('check_availability', { date: '2026-11-19', time: '10:00' })).toMatchObject({ available: true });
  });
  it('rejects malformed input', () => {
    const s = new Sandbox();
    expect(s.invoke('check_availability', { date: 'next thursday' })).toMatchObject({ ok: false, error: 'BAD_DATE' });
    expect(s.invoke('book_appointment', { name: 'X' })).toMatchObject({ ok: false, error: 'MISSING_FIELD' });
    expect(s.invoke('validate_phone', { phone: '12345' }).ok).toBe(false);
    expect(s.invoke('validate_phone', { phone: '(631) 555-0142' })).toMatchObject({ ok: true, normalized: '6315550142' });
  });
  it('enforces name match when a name is supplied and computes late fee', () => {
    const s = new Sandbox();
    expect(s.invoke('cancel_appointment', { bookingId: 'BK-1002', name: 'Jordan Pike' })).toMatchObject({ ok: false, error: 'NAME_MISMATCH' });
    expect(s.invoke('cancel_appointment', { bookingId: 'BK-1003', name: 'tom reyes' })).toMatchObject({ ok: true, lateFee: 50 });
    expect(s.invoke('cancel_appointment', { bookingId: 'BK-1001', name: 'Jordan Pike' })).toMatchObject({ ok: true, lateFee: 0 });
    expect(s.invoke('cancel_appointment', { bookingId: 'BK-1001' })).toMatchObject({ ok: false, error: 'NOT_FOUND' });
  });
  it('is isolated per instance', () => {
    const a = new Sandbox(); const b = new Sandbox();
    a.invoke('book_appointment', { name: 'A', service: 'exam', date: '2026-11-19', time: '09:00' });
    expect(b.bookings.length).toBe(5);
  });
});
