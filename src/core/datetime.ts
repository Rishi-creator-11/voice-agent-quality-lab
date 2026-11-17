import { HOURS, SANDBOX_TODAY, SLOT_MINUTES } from './clinic';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const fromISO = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (iso: string, n: number) => { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
export const weekday = (iso: string) => fromISO(iso).getUTCDay();
export const dayName = (iso: string) => DAYS[weekday(iso)][0].toUpperCase() + DAYS[weekday(iso)].slice(1);
export const prettyDate = (iso: string) => {
  const d = fromISO(iso);
  return `${dayName(iso)}, ${MONTHS[d.getUTCMonth()][0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1)} ${d.getUTCDate()}`;
};
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const prettyTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
};

export interface ParsedDate { iso: string; }
/** Returns the first (or last, if `last`) date mention in text, relative to the sandbox clock. */
export function parseDate(text: string, today = SANDBOX_TODAY, last = false): ParsedDate | null {
  const t = text.toLowerCase();
  const found: { idx: number; iso: string }[] = [];
  const push = (idx: number, iso: string) => found.push({ idx, iso });
  let m: RegExpExecArray | null;
  const rxDay = new RegExp(`\\b(last |next |this )?(${DAYS.join('|')})\\b`, 'g');
  while ((m = rxDay.exec(t))) {
    const target = DAYS.indexOf(m[2]);
    const mod = (m[1] || '').trim();
    const cur = weekday(today);
    if (mod === 'last') { let diff = (cur - target + 7) % 7 || 7; push(m.index, addDays(today, -diff)); continue; }
    let diff = (target - cur + 7) % 7;
    if (diff === 0) diff = 7;
    push(m.index, addDays(today, diff));
  }
  const rx2 = /\b(today|tomorrow|yesterday)\b/g;
  while ((m = rx2.exec(t))) push(m.index, addDays(today, m[1] === 'today' ? 0 : m[1] === 'tomorrow' ? 1 : -1));
  const rxMon = new RegExp(`\\b(${MONTHS.map((x) => x.slice(0, 3)).join('|')})[a-z]*\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b`, 'g');
  while ((m = rxMon.exec(t))) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m![1]));
    const year = Number(today.slice(0, 4));
    let iso = `${year}-${pad(mo + 1)}-${pad(Number(m[2]))}`;
    if (iso < today) iso = `${year + 1}-${pad(mo + 1)}-${pad(Number(m[2]))}`;
    push(m.index, iso);
  }
  const ORD = ['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth','twentieth','twenty-first','twenty-second','twenty-third','twenty-fourth','twenty-fifth','twenty-sixth','twenty-seventh','twenty-eighth','twenty-ninth','thirtieth','thirty-first'];
  const rxOrd = new RegExp(`\\bthe (${ORD.join('|')})\\b`, 'g');
  while ((m = rxOrd.exec(t))) {
    const day = ORD.indexOf(m[1]) + 1;
    let iso = `${today.slice(0, 7)}-${pad(day)}`;
    if (iso < today) { const d = fromISO(today); iso = `${d.getUTCMonth() === 11 ? d.getUTCFullYear() + 1 : d.getUTCFullYear()}-${pad(((d.getUTCMonth() + 1) % 12) + 1)}-${pad(day)}`; }
    push(m.index, iso);
  }
  const rxNum = /\b(\d{1,2})\/(\d{1,2})\b/g;
  while ((m = rxNum.exec(t))) push(m.index, `${today.slice(0, 4)}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`);
  if (!found.length) return null;
  found.sort((a, b) => a.idx - b.idx);
  return { iso: (last ? found[found.length - 1] : found[0]).iso };
}

/** Parses a time of day. `resolveAmbiguous`: bare hours 1-7 become PM, 8-11 AM, 12 PM. */
export function parseTime(text: string, resolveAmbiguous: boolean, last = false): string | null {
  const t = text.toLowerCase();
  const found: { idx: number; v: string }[] = [];
  let m: RegExpExecArray | null;
  if (/\bnoon\b/.test(t)) found.push({ idx: t.indexOf('noon'), v: '12:00' });
  const rx = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)/g;
  while ((m = rx.exec(t))) {
    let h = Number(m[1]); const mi = Number(m[2] || 0); const pm = m[3].startsWith('p');
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    found.push({ idx: m.index, v: `${pad(h)}:${pad(mi)}` });
  }
  const rx24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(am|pm))/g;
  while ((m = rx24.exec(t))) found.push({ idx: m.index, v: `${pad(Number(m[1]))}:${m[2]}` });
  const rxAt = /\bat (\d{1,2})(?!\d|:|\s?(?:am|pm))/g;
  while ((m = rxAt.exec(t))) {
    let h = Number(m[1]);
    if (resolveAmbiguous) { if (h >= 1 && h <= 7) h += 12; }
    found.push({ idx: m.index, v: `${pad(h)}:00` });
  }
  if (!found.length) return null;
  found.sort((a, b) => a.idx - b.idx);
  return (last ? found[found.length - 1] : found[0]).v;
}

export function slotsForDay(iso: string): string[] {
  const h = HOURS[weekday(iso)];
  if (!h) return [];
  const out: string[] = [];
  for (let m = toMinutes(h.open); m + SLOT_MINUTES <= toMinutes(h.close); m += SLOT_MINUTES) out.push(fromMinutes(m));
  return out;
}
