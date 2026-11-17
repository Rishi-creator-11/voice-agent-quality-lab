import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { handler } = require('../regal-functions/check_availability.cjs') as { handler: (e: unknown) => Promise<Record<string, unknown>> };

// Local shim only: proves the drafted function behaves per its schema. It does NOT prove anything about Regal's runtime.
describe('regal-functions/check_availability.cjs (local shim)', () => {
  it('returns taken / closed / outside_hours / available', async () => {
    expect(await handler({ params: { date: '2026-11-17', time: '10:00' } })).toMatchObject({ available: false, reason: 'taken' });
    expect(await handler({ params: { date: '2026-11-22' } })).toMatchObject({ available: false, reason: 'closed' });
    expect(await handler({ params: { date: '2026-11-21', time: '13:00' } })).toMatchObject({ available: false, reason: 'outside_hours' });
    expect(await handler({ params: { date: '2026-11-19', time: '10:00' } })).toMatchObject({ ok: true, available: true });
  });
  it('returns failure as fields, never throws', async () => {
    expect(await handler({ params: { date: 'soon' } })).toMatchObject({ ok: false, reason: 'BAD_DATE' });
    expect(await handler(undefined)).toMatchObject({ ok: false });
  });
});
