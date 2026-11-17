/** Fictional clinic. All data is synthetic. */
export const CLINIC = {
  name: 'Maple Grove Family Dental',
  note: 'Fictional clinic for demonstration. No real patients.',
};

/** 0 = Sunday. Times are HH:MM, 24h. */
export const HOURS: Record<number, { open: string; close: string } | null> = {
  0: null,
  1: { open: '08:00', close: '17:00' },
  2: { open: '08:00', close: '17:00' },
  3: { open: '08:00', close: '17:00' },
  4: { open: '08:00', close: '17:00' },
  5: { open: '08:00', close: '17:00' },
  6: { open: '09:00', close: '13:00' },
};
export const SLOT_MINUTES = 30;
export const HOURS_TEXT =
  'We are open Monday through Friday from 8:00 AM to 5:00 PM and Saturday from 9:00 AM to 1:00 PM. We are closed on Sundays.';

export const SERVICES: Record<string, { label: string; price: number; words: RegExp }> = {
  cleaning: { label: 'teeth cleaning', price: 120, words: /clean/ },
  exam: { label: 'dental exam', price: 85, words: /exam|check-?up|check up/ },
  xray: { label: 'set of X-rays', price: 60, words: /x-?ray/ },
  whitening: { label: 'whitening treatment', price: 350, words: /whiten/ },
  filling: { label: 'filling (per tooth)', price: 175, words: /filling|cavity/ },
};
/** Services the clinic does not publish prices for. */
export const UNPRICED = /root canal|crown|braces|implant|extraction|veneer|invisalign|denture|bridge/;
export const UNPRICED_LABEL: Record<string, string> = {
  'root canal': 'root canal', crown: 'crown', braces: 'braces', implant: 'implant', extraction: 'extraction',
  veneer: 'veneer', invisalign: 'Invisalign', denture: 'dentures', bridge: 'bridge',
};

export const INSURANCE_ACCEPTED = ['Delta Dental', 'Aetna', 'Cigna'];
export const INSURANCE_OTHERS = ['MetLife', 'Guardian', 'UnitedHealthcare', 'United Healthcare', 'Humana', 'Medicaid', 'Anthem'];

export const CANCEL_POLICY = 'Cancellations with less than 24 hours’ notice incur a $50 fee.';
export const LATE_FEE = 50;

/** Sandbox "now": Monday 16 Nov 2026, 09:00. Fixed so tests are deterministic. */
export const SANDBOX_TODAY = '2026-11-16';
export const SANDBOX_NOW_MINUTES = 9 * 60;

export interface Booking {
  id: string; name: string; phone: string; service: string;
  date: string; time: string; status: 'active' | 'cancelled';
}
export const SEED_BOOKINGS: Booking[] = [
  { id: 'BK-1001', name: 'Jordan Pike', phone: '5555550101', service: 'cleaning', date: '2026-11-19', time: '15:00', status: 'active' },
  { id: 'BK-1002', name: 'Maria Gomez', phone: '5555550102', service: 'exam', date: '2026-11-18', time: '14:00', status: 'active' },
  { id: 'BK-1003', name: 'Tom Reyes', phone: '5555550103', service: 'cleaning', date: '2026-11-17', time: '08:30', status: 'active' },
  { id: 'BK-1004', name: 'Priya Nair', phone: '5555550104', service: 'filling', date: '2026-11-17', time: '10:00', status: 'active' },
  { id: 'BK-1005', name: 'Sam Ortiz', phone: '5555550105', service: 'exam', date: '2026-11-17', time: '10:30', status: 'active' },
];
export const SEED_PATIENT_NAMES = SEED_BOOKINGS.map((b) => b.name);
