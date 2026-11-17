import Database from 'better-sqlite3';
import { SEED_BOOKINGS } from '../src/core/clinic';

export type Db = Database.Database;

/** Isolated in-memory clinic database (synthetic data only). One per conversation / eval run. */
export function createClinicDb(): Db {
  const db = new Database(':memory:');
  db.pragma('journal_mode = MEMORY');
  db.exec(`
    CREATE TABLE bookings (
      code TEXT PRIMARY KEY, full_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL,
      service TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','cancelled')), seq INTEGER NOT NULL
    );
    -- Transactional booking constraint: at most one ACTIVE booking per slot.
    CREATE UNIQUE INDEX ux_active_slot ON bookings(date, time) WHERE status = 'active';
    CREATE TABLE idempotency (key TEXT PRIMARY KEY, result TEXT NOT NULL);
    CREATE TABLE handoffs (id INTEGER PRIMARY KEY AUTOINCREMENT, reason TEXT NOT NULL);
    CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, tool TEXT NOT NULL, ok INTEGER NOT NULL, detail TEXT);
  `);
  const ins = db.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?)');
  SEED_BOOKINGS.forEach((b, i) => ins.run(b.id, b.name, b.name.split(' ').pop()!, b.phone, b.service, b.date, b.time, b.status, i + 1));
  db.prepare("INSERT INTO idempotency VALUES ('__seq__', '1005')").run();
  return db;
}

export interface BookingRow { code: string; full_name: string; last_name: string; phone: string; service: string; date: string; time: string; status: 'active' | 'cancelled'; seq: number; }
export const snapshot = (db: Db): BookingRow[] => db.prepare('SELECT * FROM bookings ORDER BY seq').all() as BookingRow[];
export const handoffs = (db: Db): string[] => (db.prepare('SELECT reason FROM handoffs ORDER BY id').all() as { reason: string }[]).map((r) => r.reason);
