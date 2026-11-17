import { useCallback, useEffect, useRef, useState } from 'react';
import { prettyDate, prettyTime } from '../../core/datetime';
import { API_URL, endSession, getHealth, postChat, type ChatResponse, type Health } from '../api';
import { ms, usd } from '../components/format';
import { EventCard, Notice, Panel, Segmented, Skeleton } from '../components/ui';
import { useVoice } from '../useVoice';

type AgentId = 'A' | 'B';
interface Msg { role: 'user' | 'agent' | 'error'; text: string; meta?: string }
interface ToolEvent { id: number; name: string; ok: boolean; at: number; ms: number; input: unknown; result: unknown }
interface SessionEvent { id: number; at: number; text: string }
const STARTERS = [
  'Book me a dental cleaning for next Friday',
  'Can you move my appointment to Monday?',
  'Do you have anything available this afternoon?',
  'I need help with my existing booking',
];
const BLURB: Record<AgentId, string> = {
  A: 'Basic instructions plus the clinic facts.',
  B: 'Structured rules: grounding, safety, confirm-before-change, date handling.',
};
const shortDate = (iso: string) => prettyDate(iso).replace(/^(\w{3})\w*, (\w{3})\w* /, '$1, $2 ');
const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour12: false });

export default function Playground() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState('');
  useEffect(() => { if (API_URL) getHealth().then(setHealth).catch((e: Error) => setHealthErr(e.message)); }, []);

  if (!API_URL) return <Notice tone="warn" title="Live agents need a backend">This deployment was built without a backend URL, so live conversations are unavailable. Recorded results are on the Overview and Scenarios pages.</Notice>;
  if (healthErr) return <Notice tone="bad" title="Backend unreachable">{healthErr}</Notice>;
  if (!health) return <div className="split"><Skeleton height={420} /><Skeleton height={420} /></div>;
  if (!health.llmConfigured) return <Notice tone="warn" title="Model not configured">The backend is running but has no model API key, so it cannot run agents. Nothing is simulated in its place.</Notice>;
  if (!health.publicChatEnabled) return <Notice tone="warn" title="Live chat is switched off">The operator disabled public conversations to control cost. Recorded results are still available.</Notice>;
  if (health.dailyBudgetReached) return <Notice tone="warn" title="Daily usage budget reached">The demo’s daily model budget is used up and resets at midnight UTC.</Notice>;
  return <Session health={health} />;
}

function Session({ health }: { health: Health }) {
  const [agent, setAgent] = useState<AgentId>('B');
  const [session, setSession] = useState<string | undefined>();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [tools, setTools] = useState<ToolEvent[]>([]);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [bookings, setBookings] = useState<ChatResponse['bookings']>([]);
  const [handoffs, setHandoffs] = useState<string[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [stats, setStats] = useState({ turns: 0, calls: 0, inTok: 0, outTok: 0, cost: 0, ms: 0 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [handsFree, setHandsFree] = useState(false);
  const [phoneStyle, setPhoneStyle] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const settings = useRef({ speakReplies, handsFree, agent, phoneStyle });
  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);
  sessionRef.current = session;
  settings.current = { speakReplies, handsFree, agent, phoneStyle };
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs, busy]);

  const log = useCallback((t: string) => setEvents((e) => [...e, { id: ++idRef.current, at: Date.now(), text: t }]), []);

  const send = useCallback(async (raw: string) => {
    const message = raw.trim();
    if (!message || busyRef.current) return;
    busyRef.current = true; setBusy(true); setText('');
    setMsgs((m) => [...m, { role: 'user', text: message }]);
    if (!sessionRef.current) log(`Session started with Agent ${settings.current.agent}`);
    log('Caller message sent');
    try {
      const r = await postChat(settings.current.agent, message, sessionRef.current, settings.current.phoneStyle ? 'voice' : 'text');
      const at = Date.now();
      setSession(r.sessionId); setBookings(r.bookings); setHandoffs(r.handoffs); setRemaining(r.remainingTurns);
      setTools((t) => [...t, ...r.toolCalls.map((c) => ({ id: ++idRef.current, name: c.name, ok: c.result.ok, at, ms: c.ms, input: c.input, result: c.result }))]);
      r.toolCalls.forEach((c) => log(`Tool ${c.name} ${c.result.ok ? 'succeeded' : 'returned an error'}${c.name === 'transfer_to_human' && c.result.ok ? ' (handoff recorded)' : ''}`));
      log(`Agent replied in ${ms(r.totalMs)}`);
      setStats((s) => ({ turns: s.turns + 1, calls: s.calls + r.toolCalls.length, inTok: s.inTok + r.usage.inputTokens, outTok: s.outTok + r.usage.outputTokens, cost: s.cost + r.usage.costUsd, ms: s.ms + r.totalMs }));
      setMsgs((m) => [...m, { role: 'agent', text: r.reply, meta: `${r.usage.llmCalls} model call${r.usage.llmCalls === 1 ? '' : 's'} · ${r.usage.inputTokens}+${r.usage.outputTokens} tokens · ${ms(r.totalMs)} · ${usd(r.usage.costUsd)}` }]);
      const v = voiceRef.current;
      if (v && v.supported && settings.current.speakReplies) v.speak(r.reply, () => { if (settings.current.handsFree) v.startListening(); });
    } catch (e) {
      log(`Error: ${(e as Error).message}`);
      setMsgs((m) => [...m, { role: 'error', text: (e as Error).message }]);
    } finally { busyRef.current = false; setBusy(false); inputRef.current?.focus(); }
  }, [log]);
  const voice = useVoice((t) => void send(t));
  voiceRef.current = voice;

  const reset = () => {
    if (session) void endSession(session);
    voice.stopListening(); voice.stopSpeaking();
    setSession(undefined); setMsgs([]); setTools([]); setEvents([]); setBookings([]); setHandoffs([]); setRemaining(null);
    setStats({ turns: 0, calls: 0, inTok: 0, outTok: 0, cost: 0, ms: 0 });
  };
  const started = msgs.length > 0;

  return (
    <div className="split">
      <Panel>
        <Panel.Head title="Conversation" aside={remaining !== null ? `${remaining} messages left` : `${health.limits.maxTurnsPerSession} messages per conversation`} />
        <Panel.Body>
          <div className="stack">
            <div className="cluster between">
              <Segmented label="Agent" value={agent} disabled={started} onChange={setAgent} options={[{ value: 'A', label: 'Agent A · initial' }, { value: 'B', label: 'Agent B · improved' }]} />
              <button className="btn secondary small" onClick={reset} disabled={!started}>New conversation</button>
            </div>
            <p className="muted small">{BLURB[agent]} Real model (<span className="mono">{health.model}</span>); sandbox date Monday, Nov 16, 2026.</p>

            <div className="chat tall" role="log" aria-live="polite" aria-label="Conversation with the agent" tabIndex={0}>
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
              <button className="btn secondary small" disabled={!voice.supported || busy} onClick={() => (voice.listening ? voice.stopListening() : voice.startListening())} aria-pressed={voice.listening}>
                {voice.listening ? 'Listening… tap to stop' : 'Speak'}
              </button>
              {voice.speaking ? <button className="btn secondary small" onClick={voice.stopSpeaking}>Interrupt agent</button> : null}
              <label className="check"><input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} disabled={!voice.supported} />Speak replies</label>
              <label className="check"><input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} disabled={!voice.supported} />Hands-free</label>
              <label className="check" title="Shorter replies written to be spoken. Applies to both agents. The recorded evaluation used normal text replies."><input type="checkbox" checked={phoneStyle} onChange={(e) => setPhoneStyle(e.target.checked)} disabled={started} />Phone-call style replies</label>
            </div>
            {voice.supported ? (
              <details>
                <summary>Voice settings</summary>
                <div className="stack" style={{ paddingTop: 10 }}>
                  <label className="field">Voice
                    <select value={voice.activeVoice?.voiceURI ?? ''} onChange={(e) => voice.setVoice(e.target.value)} disabled={voice.voices.length === 0}>
                      {voice.voices.length === 0 ? <option value="">No English voices found</option> : voice.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang}){v.localService ? '' : ' · online'}</option>)}
                    </select>
                  </label>
                  <label className="field">Speed {voice.rate.toFixed(2)}×
                    <input type="range" min="0.8" max="1.3" step="0.05" value={voice.rate} onChange={(e) => voice.setRate(Number(e.target.value))} />
                  </label>
                  <div className="cluster"><button type="button" className="btn secondary small" onClick={() => voice.speak('Thanks for calling Maple Grove Family Dental. Your confirmation code is BK-1006, and your cleaning is Friday at 2:00 PM, for 120 dollars.')}>Test voice</button>
                    <span className="muted tiny">The best-sounding English voice on this device is chosen by default. Premium or online voices sound far more natural than the basic ones.</span></div>
                </div>
              </details>
            ) : null}
            {!voice.supported ? <p className="muted tiny">Voice needs a browser with speech recognition and synthesis (Chrome, Edge or Safari). Typing works everywhere.</p>
              : <p className="muted tiny">Voice uses your browser’s speech services; in Chrome, recognition audio is processed by Google. This app records and stores no audio. Not yet verified end to end with a microphone.</p>}
            {voice.error ? <p className="small" style={{ color: 'var(--fail)' }} role="alert">{voice.error}</p> : null}
          </div>
        </Panel.Body>
      </Panel>

      <div className="sticky-col">
        <Panel>
          <Panel.Head level={3} title="Tool calls" aside={`${tools.length} so far`} />
          <Panel.Body>
            {tools.length === 0 ? <p className="muted small">Tool calls appear here as the agent makes them. Expand one to see its exact input and result.</p>
              : <div className="events">{tools.map((t) => <EventCard key={t.id} name={t.name} ok={t.ok} when={`${clock(t.at)} · ${ms(t.ms)}`} input={t.input} result={t.result} />)}</div>}
          </Panel.Body>
        </Panel>

        <Panel>
          <Panel.Head level={3} title="Database state" aside={`${bookings.filter((b) => b.status === 'active').length} active`} />
          <Panel.Table label="Bookings in this conversation's database">
            <table className="small">
              <caption className="sr-only">Bookings in the sandbox database, updated after each message</caption>
              <thead><tr><th scope="col">Code</th><th scope="col">Patient</th><th scope="col">When</th></tr></thead>
              <tbody>
                {bookings.length === 0 ? <tr><td colSpan={3} className="muted">Appears after the first message. Synthetic patients; each conversation has its own copy.</td></tr> : bookings.map((b) => (
                  <tr key={b.code} style={b.status === 'cancelled' ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                    <th scope="row" className="mono num">{b.code}</th><td>{b.name}</td><td className="num">{shortDate(b.date)} · {prettyTime(b.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel.Table>
          {handoffs.length ? <Panel.Body><p className="small"><strong>Transfer to front desk requested:</strong> {handoffs.join('; ')}</p></Panel.Body> : null}
        </Panel>

        <Panel>
          <Panel.Head level={3} title="Session events" />
          <Panel.Body>
            {events.length === 0 ? <p className="muted small">A timeline of what happens in this session.</p>
              : <ol className="timeline" aria-label="Session events">{events.slice(-12).map((e) => <li key={e.id}><time>{clock(e.at)}</time><span>{e.text}</span></li>)}</ol>}
          </Panel.Body>
        </Panel>

        <Panel>
          <Panel.Head level={3} title="Session stats" />
          <Panel.Body>
            <dl className="statline">
              <div><dt>Messages</dt><dd className="num">{stats.turns}</dd></div>
              <div><dt>Tool calls</dt><dd className="num">{stats.calls}</dd></div>
              <div><dt>Tokens in / out</dt><dd className="num">{stats.inTok.toLocaleString()} / {stats.outTok.toLocaleString()}</dd></div>
              <div><dt>Model cost</dt><dd className="num">{usd(stats.cost)}</dd></div>
              <div><dt>Mean latency</dt><dd className="num">{stats.turns ? ms(stats.ms / stats.turns) : '–'}</dd></div>
              <div><dt>Messages left</dt><dd className="num">{remaining ?? health.limits.maxTurnsPerSession}</dd></div>
            </dl>
          </Panel.Body>
        </Panel>
      </div>
    </div>
  );
}
