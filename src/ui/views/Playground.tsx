import { useCallback, useEffect, useRef, useState } from 'react';
import { prettyDate, prettyTime } from '../../core/datetime';
import { API_URL, endSession, getHealth, postChat, type ChatResponse, type Health } from '../api';
import { ms, usd } from '../components/format';
import { ToolLine } from '../components/Transcript';
import { Notice, Panel } from '../components/ui';
import { useVoice } from '../useVoice';

interface Msg { role: 'user' | 'agent' | 'error'; text: string; tools?: ChatResponse['toolCalls']; meta?: string }
type AgentId = 'A' | 'B';
const shortDate = (iso: string) => prettyDate(iso).replace(/^(\w{3})\w*, (\w{3})\w* /, '$1, $2 ');
const STARTERS = [
  "Hi, I'd like to book a cleaning next Friday.",
  'How much is a root canal?',
  "My son's tooth got knocked out and he's bleeding badly.",
  'Can I speak to someone at the front desk?',
];
const AGENT_BLURB: Record<AgentId, string> = {
  A: 'Basic instructions plus the clinic facts.',
  B: 'Structured rules: grounding, safety, confirm-before-change, date handling.',
};

export default function Playground() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState('');
  useEffect(() => {
    if (!API_URL) return;
    getHealth().then(setHealth).catch((e: Error) => setHealthErr(e.message));
  }, []);

  if (!API_URL) return <Notice tone="warn" title="Live agents need a backend">This deployment was built without a backend URL, so live conversations are unavailable. Recorded results are on the Results and Scenarios pages. To run it locally, see the README.</Notice>;
  if (healthErr) return <Notice tone="bad" title="Backend unreachable">{healthErr}</Notice>;
  if (!health) return <p className="muted" role="status">Contacting the backend…</p>;
  if (!health.llmConfigured) return <Notice tone="warn" title="Model not configured">The backend is running but has no model API key, so it cannot run agents. Nothing is simulated in its place.</Notice>;
  if (!health.publicChatEnabled) return <Notice tone="warn" title="Live chat is switched off">The operator disabled public conversations to control cost. Recorded results are still available.</Notice>;
  if (health.dailyBudgetReached) return <Notice tone="warn" title="Daily usage budget reached">The demo’s daily model budget is used up and resets at midnight UTC.</Notice>;
  return <Conversation health={health} />;
}

function Conversation({ health }: { health: Health }) {
  const [agent, setAgent] = useState<AgentId>('B');
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
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const busyRef = useRef(false);
  const settings = useRef({ speakReplies, handsFree, agent });
  sessionRef.current = session;
  settings.current = { speakReplies, handsFree, agent };

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);

  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);
  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true; setBusy(true); setText('');
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    try {
      const r = await postChat(settings.current.agent, message, sessionRef.current);
      setSession(r.sessionId); setBookings(r.bookings); setHandoffs(r.handoffs); setRemaining(r.remainingTurns); setSpent((s) => s + r.usage.costUsd);
      setMsgs((m) => [...m, { role: 'agent', text: r.reply, tools: r.toolCalls, meta: `${r.usage.llmCalls} model call${r.usage.llmCalls === 1 ? '' : 's'} · ${r.usage.inputTokens}+${r.usage.outputTokens} tokens · ${ms(r.totalMs)} · ${usd(r.usage.costUsd)}` }]);
      const v = voiceRef.current;
      if (v && v.supported && settings.current.speakReplies) v.speak(r.reply, () => { if (settings.current.handsFree) v.startListening(); });
    } catch (e) {
      setMsgs((m) => [...m, { role: 'error', text: (e as Error).message }]);
    } finally { busyRef.current = false; setBusy(false); inputRef.current?.focus(); }
  }, []);
  const voice = useVoice((t) => void send(t));
  voiceRef.current = voice;

  const reset = (a: AgentId = agent) => {
    if (session) void endSession(session);
    voice.stopListening(); voice.stopSpeaking();
    setAgent(a); setSession(undefined); setMsgs([]); setBookings([]); setHandoffs([]); setRemaining(null); setSpent(0);
  };
  const started = msgs.length > 0;
  const active = bookings.filter((b) => b.status === 'active').length;

  return (
    <div className="split">
      <Panel>
        <Panel.Head title="Conversation" aside={remaining !== null ? `${remaining} messages left` : `${health.limits.maxTurnsPerSession} messages per conversation`} />
        <Panel.Body>
          <div className="stack">
            <div className="cluster">
              <div className="chips" role="group" aria-label="Agent">
                {(['A', 'B'] as AgentId[]).map((a) => (
                  <button key={a} className="chip" aria-pressed={agent === a} disabled={started} onClick={() => setAgent(a)} title={AGENT_BLURB[a]}>Agent {a}{a === 'A' ? ' · initial' : ' · improved'}</button>
                ))}
              </div>
              <button className="btn secondary small" onClick={() => reset()} disabled={!started}>New conversation</button>
            </div>
            <p className="muted small">{AGENT_BLURB[agent]} Real model (<span className="mono">{health.model}</span>), sandbox date Monday, Nov 16, 2026.</p>

            <div className="chat" role="log" aria-live="polite" aria-label="Conversation with the agent" tabIndex={0}>
              {!started && (
                <div className="stack">
                  <p className="muted small">Start with a suggestion or type your own.</p>
                  <div className="chips">{STARTERS.map((s) => <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>{s}</button>)}</div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  <span className="sr-only">{m.role === 'user' ? 'You: ' : m.role === 'agent' ? 'Agent: ' : 'Error: '}</span>
                  {m.text || '(no reply)'}
                  {m.tools?.map((c, j) => <ToolLine key={j} call={c} />)}
                  {m.meta ? <div className="meta">{m.meta}</div> : null}
                </div>
              ))}
              {busy ? <div className="msg agent muted" aria-busy="true">Thinking…</div> : null}
              <div ref={endRef} />
            </div>

            <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <label htmlFor="msg" className="sr-only">Message to the agent</label>
              <input id="msg" name="message" ref={inputRef} className="input" type="text" value={voice.interim || text} onChange={(e) => setText(e.target.value)} maxLength={health.limits.maxMessageChars} placeholder="Type what the caller says…" autoComplete="off" spellCheck={false} disabled={busy} />
              <button className="btn" type="submit" disabled={busy || !text.trim()}>Send</button>
            </form>

            <div className="cluster">
              <button className="btn secondary" disabled={!voice.supported || busy} onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())} aria-pressed={voice.listening}>
                {voice.listening ? 'Listening… tap to stop' : 'Speak'}
              </button>
              {voice.speaking ? <button className="btn secondary" onClick={voice.stopSpeaking}>Interrupt agent</button> : null}
              <label className="check"><input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} disabled={!voice.supported} />Speak replies</label>
              <label className="check"><input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} disabled={!voice.supported} />Hands-free</label>
            </div>
            {!voice.supported ? <p className="muted small">Voice needs a browser with speech recognition and synthesis (Chrome, Edge or Safari). Typing works everywhere.</p>
              : <p className="muted small">Voice uses your browser’s speech services; in Chrome, recognition audio is processed by Google. This app records and stores no audio. Not yet verified end to end with a microphone.</p>}
            {voice.error ? <p className="small" style={{ color: 'var(--fail)' }} role="alert">{voice.error}</p> : null}
          </div>
        </Panel.Body>
      </Panel>

      <Panel>
        <Panel.Head title="Database (this conversation)" aside={`${active} active · ${usd(spent)} model cost`} />
        <Panel.Table label="Bookings in this conversation's database">
          <table className="small">
            <caption className="sr-only">Bookings in the sandbox database, updated after each message</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Patient</th><th scope="col">When</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {bookings.length === 0 ? <tr><td colSpan={4} className="muted">Appears after the first message. Synthetic patients; each conversation gets its own copy.</td></tr> : bookings.map((b) => (
                <tr key={b.code} style={b.status === 'cancelled' ? { opacity: 0.55 } : undefined}>
                  <th scope="row" className="mono num">{b.code}</th><td>{b.name}</td><td className="num">{shortDate(b.date)} · {prettyTime(b.time)}</td><td>{b.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel.Table>
        {handoffs.length ? <Panel.Body><p className="small"><strong>Transfer to front desk requested:</strong> {handoffs.join('; ')}</p></Panel.Body> : null}
      </Panel>
    </div>
  );
}
