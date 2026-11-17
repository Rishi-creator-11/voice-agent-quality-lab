import { useCallback, useEffect, useRef, useState } from 'react';
import { rankVoices, toSpeechChunks } from './speech';

/** Browser voice I/O via the Web Speech API (recognition + synthesis). This app records and stores no audio. */
interface RecEvent { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>; }
interface Rec {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; abort(): void;
  onresult: ((e: RecEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; onspeechstart: (() => void) | null;
}
type RecCtor = new () => Rec;
const ctor = (): RecCtor | undefined => {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, RecCtor | undefined>;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const KEY = 'val.voice.v1';
interface Saved { voiceURI?: string; rate?: number }
const load = (): Saved => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved; } catch { return {}; } };
const save = (s: Saved) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
export const clampRate = (r: number) => Math.min(1.3, Math.max(0.8, r));

export function useVoice(onFinal: (text: string) => void) {
  const supported = !!ctor() && typeof speechSynthesis !== 'undefined';
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string | undefined>(() => load().voiceURI);
  const [rate, setRateState] = useState<number>(() => clampRate(load().rate ?? 1));
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onFinal);
  const prefs = useRef({ voiceURI, rate, voices });
  cb.current = onFinal;
  prefs.current = { voiceURI, rate, voices };

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const read = () => setVoices(rankVoices(speechSynthesis.getVoices()));
    read();
    speechSynthesis.addEventListener('voiceschanged', read);
    return () => speechSynthesis.removeEventListener('voiceschanged', read);
  }, []);

  /** The chosen voice, or the best-ranked English voice installed on this device. */
  const activeVoice = voices.find((v) => v.voiceURI === voiceURI) ?? voices[0];
  const setVoice = (uri: string) => { setVoiceURI(uri); save({ voiceURI: uri, rate }); };
  const setRate = (r: number) => { const c = clampRate(r); setRateState(c); save({ voiceURI, rate: c }); };

  const startListening = useCallback(() => {
    const C = ctor(); if (!C) return;
    // Barge-in: opening the mic (and detecting speech) cuts off the agent's voice.
    speechSynthesis.cancel(); setSpeaking(false); setError('');
    const r = new C(); r.lang = 'en-US'; r.interimResults = true; r.continuous = false; rec.current = r;
    r.onspeechstart = () => { speechSynthesis.cancel(); setSpeaking(false); };
    r.onresult = (e) => {
      let t = ''; let fin = false;
      for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
      setInterim(fin ? '' : t);
      if (fin && t.trim()) cb.current(t.trim());
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'no-speech' ? 'No speech detected.' : `Speech recognition error: ${e.error}`);
    r.onend = () => { setListening(false); setInterim(''); };
    try { r.start(); setListening(true); } catch { setError('Could not start the microphone.'); }
  }, []);
  const stopListening = useCallback(() => { rec.current?.abort(); setListening(false); setInterim(''); }, []);

  /** Speaks sentence by sentence with the chosen voice. `then` runs after the last sentence. */
  const speak = useCallback((text: string, then?: () => void) => {
    if (typeof speechSynthesis === 'undefined') return;
    const chunks = toSpeechChunks(text); if (!chunks.length) return;
    speechSynthesis.cancel();
    const { voiceURI: uri, rate: r, voices: vs } = prefs.current;
    const voice = vs.find((v) => v.voiceURI === uri) ?? vs[0];
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
      u.rate = r; u.pitch = 1;
      if (i === 0) u.onstart = () => setSpeaking(true);
      if (i === chunks.length - 1) { u.onend = () => { setSpeaking(false); then?.(); }; }
      u.onerror = (e) => { if ((e as SpeechSynthesisErrorEvent).error !== 'canceled' && (e as SpeechSynthesisErrorEvent).error !== 'interrupted') setSpeaking(false); };
      speechSynthesis.speak(u);
    });
  }, []);
  const stopSpeaking = useCallback(() => { speechSynthesis.cancel(); setSpeaking(false); }, []);
  useEffect(() => () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); rec.current?.abort(); }, []);
  return { supported, listening, interim, speaking, error, voices, activeVoice, rate, setVoice, setRate, startListening, stopListening, speak, stopSpeaking };
}
