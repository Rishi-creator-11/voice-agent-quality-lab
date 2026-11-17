/**
 * Regal Function (UNCONNECTED, UNTESTED ON REGAL): check_availability
 *
 * Written to the contract documented at https://developer.regal.ai/docs/functions:
 * `exports.handler(event, context)`, inputs in `event.params`, returns an object
 * matching the output schema, failure states returned as fields (not thrown).
 * It has never been uploaded to or run inside a Regal workspace (no access).
 * Only the local shim in tests/regal-function.test.ts has executed it.
 *
 * Synthetic data only. Mirrors the sandbox logic in src/core/tools.ts; Regal
 * Functions cannot import local modules, so the logic is duplicated here by necessity.
 */
const HOURS = { 0: null, 1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'], 4: ['08:00', '17:00'], 5: ['08:00', '17:00'], 6: ['09:00', '13:00'] };
const BOOKED = { '2026-11-17': ['08:30', '10:00', '10:30'], '2026-11-18': ['14:00'], '2026-11-19': ['15:00'] };
const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

exports.handler = async (event) => {
  const { date, time } = (event && event.params) || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return { ok: false, available: false, reason: 'BAD_DATE', freeSlots: [] };
  const h = HOURS[new Date(date + 'T00:00:00Z').getUTCDay()];
  if (!h) return { ok: true, available: false, reason: 'closed', freeSlots: [] };
  const taken = BOOKED[date] || [];
  const free = [];
  for (let m = mins(h[0]); m + 30 <= mins(h[1]); m += 30) if (!taken.includes(hhmm(m))) free.push(hhmm(m));
  if (!time) return { ok: true, available: free.length > 0, reason: '', freeSlots: free };
  if (!/^\d{2}:\d{2}$/.test(time) || mins(time) < mins(h[0]) || mins(time) + 30 > mins(h[1])) return { ok: true, available: false, reason: 'outside_hours', freeSlots: free };
  if (taken.includes(time)) return { ok: true, available: false, reason: 'taken', freeSlots: free };
  return { ok: true, available: true, reason: '', freeSlots: free };
};
