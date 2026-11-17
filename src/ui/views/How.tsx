import { href } from '../app/router';
import { IconBox } from '../components/ui';

const STEPS = [
  { title: 'Customer speaks or types', body: 'A caller makes a request in plain language, by text or by voice in the browser.' },
  { title: 'Agent interprets the request', body: 'A real language model decides what the caller wants and which tool to use, if any.' },
  { title: 'Backend tools execute actions', body: 'Server code validates the call, checks authorization and changes a sandbox database. The model proposes; the backend decides.' },
  { title: 'Results are evaluated and inspected', body: 'Deterministic checks read the final database state and tool trace. Every conversation can be replayed and compared.' },
];
const RECORDED = [
  ['Transcript', 'Every caller and agent message, in order.'],
  ['Tool calls', 'Name, input, result and duration of each call.'],
  ['Final database changes', 'Which bookings were created, moved or cancelled.'],
  ['Pass/fail checks', 'Each rule, its type and why it failed.'],
  ['Unsupported claims', 'Invented prices, ids, actions, coverage or addresses.'],
  ['Cost and latency', 'Tokens, dollars and time for every turn.'],
];
const DEMONSTRATES = [
  { icon: 'check', title: 'Real AI-agent evaluation', body: '216 recorded conversations on a live model, with repeat trials and a clear statement of what the sample can and cannot show.' },
  { icon: 'plug', title: 'Tool calling and backend integration', body: 'Seven validated tools on a SQLite backend with authorization, transactional bookings and idempotency.' },
  { icon: 'bug', title: 'Failure analysis', body: 'Each failed check explains itself, and the pilot run’s false positives were found, fixed and disclosed.' },
  { icon: 'trend', title: 'Regression testing', body: 'The same scenarios run against both versions, classified as better, worse, same or inconsistent.' },
  { icon: 'eye', title: 'Observability and debugging', body: 'Transcripts, tool traces, database state, tokens and cost are all inspectable per conversation.' },
  { icon: 'layers', title: 'Product thinking for AI systems', body: 'Deterministic outcomes are kept separate from a judge model’s opinions, and limits are stated in the product itself.' },
];

export default function How() {
  return (
    <div className="stack-lg" style={{ gap: 48 }}>
      <section aria-labelledby="flow" className="stack">
        <h2 id="flow">One request, four steps</h2>
        <ol className="flow" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STEPS.map((s, i) => (
            <li key={s.title} className="step"><span className="step-n" aria-hidden="true">{i + 1}</span><h3>{s.title}</h3><p>{s.body}</p></li>
          ))}
        </ol>
        <p><a className="textlink" href={href({ section: 'live' })}>Watch the steps happen in the live playground</a></p>
      </section>

      <section aria-labelledby="rec" className="stack">
        <h2 id="rec">What gets recorded</h2>
        <ul className="recorded">{RECORDED.map(([k, v]) => <li key={k}><strong>{k}</strong><span>{v}</span></li>)}</ul>
        <p><a className="textlink" href={href({ section: 'scenarios' })}>See all of it for any scenario</a></p>
      </section>

      <section aria-labelledby="demo" className="stack">
        <div className="stack-sm" style={{ maxWidth: '62ch' }}>
          <h2 id="demo">What this demonstrates</h2>
          <p className="ink2">The engineering and product practices behind the numbers.</p>
        </div>
        <div className="grid-3">
          {DEMONSTRATES.map((d) => <article key={d.title} className="feature"><IconBox name={d.icon} /><h3>{d.title}</h3><p>{d.body}</p></article>)}
        </div>
        <p className="muted small" style={{ maxWidth: '72ch' }}>Independent project: not built on, integrated with or approved by any voice-AI vendor. Agents run on a general-purpose language model; clinic data is synthetic.</p>
      </section>
    </div>
  );
}
