import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useVoice(onFinal: (text: string) => void) {
  const supported = !!ctor() && typeof speechSynthesis !== 'undefined';
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const rec = useRef<Rec | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;

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
  const speak = useCallback((text: string, then?: () => void) => {
    if (typeof speechSynthesis === 'undefined' || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ''));
    u.onstart = () => setSpeaking(true); u.onend = () => { setSpeaking(false); then?.(); }; u.onerror = () => setSpeaking(false);
    speechSynthesis.speak(u);
  }, []);
  const stopSpeaking = useCallback(() => { speechSynthesis.cancel(); setSpeaking(false); }, []);
  useEffect(() => () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); rec.current?.abort(); }, []);
  return { supported, listening, interim, speaking, error, startListening, stopListening, speak, stopSpeaking };
}
