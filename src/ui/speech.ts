/** Pure helpers that make text-to-speech sound less robotic. Tested without a browser. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const spell = (s: string) => s.split('').join(' ');

/** Rewrites chat text the way a person would say it on the phone. */
export function speakable(text: string): string {
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
  t = t.replace(/\*\*|__|\*|_(?=\S)|#{1,6}\s*/g, '');
  t = t.replace(/^\s*[-•]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '');
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, _y, mo, d) => `${MONTHS[Number(mo) - 1] ?? ''} ${Number(d)}`);
  t = t.replace(/\bBK-?(\d{4})\b/g, (_m, d) => `B K, ${spell(d)}`);
  t = t.replace(/\b(\d{3})[-.\s](\d{3})[-.\s](\d{4})\b/g, (_m, a, b, c) => `${spell(a)}, ${spell(b)}, ${spell(c)}`);
  t = t.replace(/\$(\d[\d,]*)(?:\.(\d{2}))?/g, (_m, d, c) => `${d.replace(/,/g, '')} dollars${c && c !== '00' ? ` and ${Number(c)} cents` : ''}`);
  t = t.replace(/\b(\d{1,2}):00\s?([AP])\.?M\.?/gi, (_m, h, ap) => `${h} ${ap.toUpperCase()} M`);
  t = t.replace(/\b(\d{1,2}):(\d{2})\s?([AP])\.?M\.?/gi, (_m, h, mi, ap) => `${h}:${mi} ${ap.toUpperCase()} M`);
  t = t.replace(/\s*\n+\s*/g, '. ').replace(/([.!?:])\s*\./g, '$1').replace(/\s{2,}/g, ' ').replace(/\.\s*\./g, '.');
  return t.trim();
}

/** Splits into sentence-sized pieces. Short pieces get natural pauses and avoid browsers cutting off long utterances. */
export function toSpeechChunks(text: string, max = 170): string[] {
  const sentences = speakable(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && last.length + s.length + 1 <= max) out[out.length - 1] = `${last} ${s}`; else out.push(s);
  }
  return out;
}

export interface VoiceLike { name: string; lang: string; localService?: boolean; voiceURI: string }
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy)\b/i;
const NATURAL = /(premium|enhanced|neural|natural|online|siri)/i;
const GOOD_NAMES = /\b(ava|zoe|allison|samantha|evan|nicky|tom|aaron|google us english|microsoft (aria|jenny|guy|ryan))\b/i;

/** Higher score = more natural-sounding English voice. */
export function scoreVoice(v: VoiceLike): number {
  let s = 0;
  if (/^en[-_]US/i.test(v.lang)) s += 30; else if (/^en/i.test(v.lang)) s += 18; else return -1000;
  if (NATURAL.test(v.name)) s += 55;
  if (GOOD_NAMES.test(v.name)) s += 25;
  if (/compact/i.test(v.name)) s -= 30;
  if (NOVELTY.test(v.name)) s -= 200;
  return s;
}
export const rankVoices = <T extends VoiceLike>(voices: T[]): T[] => [...voices].filter((v) => scoreVoice(v) > -1000).sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
