import { useEffect, useRef, useState } from 'react';
import { API_URL, ApiError, endSession, getHealth, postChat, type ChatResponse, type Health } from './api';
import { ms, usd } from './common';
import { prettyDate, prettyTime } from '../core/datetime';
import { useVoice } from './useVoice';

interface Msg { role: 'user' | 'agent' | 'error'; text: string; tools?: ChatResponse['toolCalls']; meta?: string; }

export function Playground() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState('');
  const [agent, setAgent] = useState<'A' | 'B'>('B');
  const [session, setSession] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [bookings, setBookings] = useState<ChatResponse['bookings']>([]);
  const [handoffs, setHandoffs] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<string | undefined>();
  sessionRef.current = session;
  const busyRef = useRef(false);

  useEffect(() => { getHealth().then(setHealth).catch((e: ApiError) => setHealthErr(e.message)); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs]);

  const voice = useVoice((t) => void send(t));
  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true; setBusy(true); setText('');
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    try {
      const r = await postChat(agent, message, sessionRef.current);
      setSession(r.sessionId); setBookings(r.bookings); setHandoffs(r.handoffs); setRemaining(r.remainingTurns); setSpent((s) => s + r.usage.costUsd);
      setMsgs((m) => [...m, { role: 'agent', text: r.reply, tools: r.toolCalls, meta: `${r.usage.llmCalls} model call(s) · ${r.usage.inputTokens}+${r.usage.outputTokens} tokens · ${ms(r.totalMs)} · ${usd(r.usage.costUsd)}` }]);
      if (speakReplies && voice.supported) voice.speak(r.reply, () => { if (handsFree) voice.startListening(); });
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', text: (e as Error).message }]);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const reset = (a: 'A' | 'B' = agent) => {
    if (session) void endSession(session);
    voice.stopListening(); voice.stopSpeaking();
    setAgent(a); setSession(undefined); setMsgs([]); setBookings([]); setHandoffs([]); setRemaining(null); setSpent(0);
  };

  if (!API_URL) return <Blocked title="Live agents need a backend" body="This deployment was built without a backend URL, so live conversations are unavailable. Recorded evaluation results are still shown in the other tabs." />;
  if (healthErr) return <Blocked title="Backend unreachable" body={healthErr} />;
  if (!health) return <p className="mute">Contacting backend…</p>;
  if (!health.llmConfigured) return <Blocked title="Model not configured" body="The backend is running but has no model API key set, so it cannot run agents. Nothing is simulated in its place." />;
  if (!health.publicChatEnabled) return <Blocked title="Live chat is switched off" body="The operator disabled public live conversations to control cost. Recorded evaluation results are still available." />;
  if (health.dailyBudgetReached) return <Blocked title="Daily usage budget reached" body="The demo’s daily model budget is used up. It resets at midnight UTC." />;

  const active = bookings.filter((b) => b.status === 'active');
  return (
    <div className="grid">
      <div className="card">
        <div className="row">
          <label>Agent <select value={agent} disabled={!!session} onChange={(e) => setAgent(e.target.value as 'A' | 'B')}><option value="A">A · initial</option><option value="B">B · improved</option></select></label>
          <button className="btn sec" onClick={() => reset()}>New conversation</button>
        </div>
        <p className="mute small">
          Real model (<code>{health.model}</code>) with real tool calls against a synthetic clinic database. Sandbox date: Monday, Nov 16, 2026. Limits: {health.limits.maxTurnsPerSession} messages per conversation, {health.limits.maxMessageChars} characters per message.
          {remaining !== null && ` ${remaining} messages left.`} Try: “Hi, I’d like to book a cleaning next Friday.” then “Actually, can you move it to Monday?”
        </p>
        <div className="chat" role="log" aria-live="polite">
          {msgs.length === 0 && <p className="mute small">Say or type something to start.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'agent'}`} style={m.role === 'error' ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : undefined}>
              {m.text || <em>(no reply)</em>}
              {m.tools?.map((c, j) => <div className="tool" key={j}>▸ {c.name}({JSON.stringify(c.input)}) → {c.result.ok ? 'ok' : 'ERROR'} {JSON.stringify(c.result)}</div>)}
              {m.meta && <div className="tool">{m.meta}</div>}
            </div>
          ))}
          {busy && <div className="msg agent mute">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <label htmlFor="pg" style={{ display: 'none' }}>Caller message</label>
          <input id="pg" type="text" value={voice.interim || text} onChange={(e) => setText(e.target.value)} maxLength={health.limits.maxMessageChars} placeholder="Type what the caller says…" autoComplete="off" disabled={busy} />
          <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
        </form>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn sec" disabled={!voice.supported || busy} onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())} aria-pressed={voice.listening}>
            {voice.listening ? '● Listening… tap to stop' : '🎤 Speak'}
          </button>
          <label className="small"><input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} disabled={!voice.supported} /> Speak replies</label>
          <label className="small"><input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} disabled={!voice.supported} /> Hands-free (re-listen after reply)</label>
          {voice.speaking && <button className="btn sec" onClick={voice.stopSpeaking}>Interrupt</button>}
        </div>
        {!voice.supported && <p className="small mute">Voice needs a browser with speech recognition and synthesis (Chrome, Edge or Safari). Typing works everywhere.</p>}
        {voice.error && <p className="small" style={{ color: 'var(--bad)' }}>{voice.error}</p>}
        {voice.supported && <p className="small mute">Voice uses your browser’s built-in speech services; in Chrome, recognition audio is processed by Google’s service. This app does not record or store audio. Starting the mic or speaking cuts off the agent’s voice.</p>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Database state (this conversation only)</h3>
        <table className="small">
          <thead><tr><th>Code</th><th>Patient</th><th>When</th><th>Status</th></tr></thead>
          <tbody>
            {(bookings.length ? bookings : []).map((b) => (
              <tr key={b.code} style={b.status === 'cancelled' ? { opacity: 0.5 } : undefined}><td>{b.code}</td><td>{b.name}</td><td>{prettyDate(b.date)} {prettyTime(b.time)}</td><td>{b.status}</td></tr>
            ))}
          </tbody>
        </table>
        {!bookings.length && <p className="mute small">Appears after the first message. Synthetic patients only; each conversation gets its own isolated copy.</p>}
        {handoffs.length > 0 && <p className="small"><strong>Transfer to front desk requested:</strong> {handoffs.join('; ')}</p>}
        <p className="mute small">{active.length} active · this conversation’s model cost so far {usd(spent)}</p>
      </div>
    </div>
  );
}

function Blocked({ title, body }: { title: string; body: string }) {
  return <div className="banner" role="status"><strong>{title}.</strong> {body}</div>;
}
