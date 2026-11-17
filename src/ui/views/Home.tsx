import { useMemo } from 'react';
import type { EvalRun, Trial } from '../../llm/types';
import { insights } from '../app/insights';
import { href } from '../app/router';
import { useRun } from '../app/RunContext';
import { scenarioRows, type ScenarioRow } from '../app/selectors';
import { count, usd } from '../components/format';
import { Badge, Icon, IconBox, Skeleton, TrialStrip } from '../components/ui';

const TRUST = ['Real LLM-powered agent', 'Live tool calling', 'Scenario-based evaluations', 'Public interactive demo'];
const PROBLEMS = [
  { icon: 'alert', title: 'Failures are hard to catch', body: 'A voice agent can sound confident while booking the wrong slot or skipping a handoff. You only find out when a customer does.' },
  { icon: 'bug', title: 'Debugging is fragmented', body: 'The transcript is in one tool, the API calls in another, the database in a third. Working out what actually happened takes too long.' },
  { icon: 'trend', title: 'Improvements need proof', body: 'Changing a prompt can fix one case and quietly break another. Without repeatable tests, you are guessing.' },
];
const FEATURES = [
  { icon: 'run', title: 'Run evaluations', body: 'Replay scripted callers against two agent versions, several times each, from a clean database.', to: 'overview', cta: 'See results' },
  { icon: 'inspect', title: 'Inspect conversations', body: 'Open any scenario to read the transcript, every tool call, the final database state and each check.', to: 'scenarios', cta: 'Browse scenarios' },
  { icon: 'compare', title: 'Compare versions', body: 'See where Agent B is better, where it is not, and what the improvement cost in tokens and latency.', to: 'overview', cta: 'Compare agents' },
  { icon: 'live', title: 'Try it live', body: 'Chat with a real model. Watch tool calls run against a sandbox clinic database as you talk.', to: 'live', cta: 'Open the playground' },
] as const;

/** The scenario that best shows the product: prefer one where B is consistently better. */
function pickEvidence(run: EvalRun, rows: ScenarioRow[]): { row: ScenarioRow; a: Trial; b: Trial } | null {
  const row = rows.find((r) => r.verdict === 'fixed') ?? rows.find((r) => r.verdict === 'regressed') ?? rows.find((r) => r.verdict !== 'both_pass');
  if (!row) return null;
  const a = run.trials.find((t) => t.scenarioId === row.scenarioId && t.agent === 'A' && !t.pass) ?? run.trials.find((t) => t.scenarioId === row.scenarioId && t.agent === 'A');
  const b = run.trials.find((t) => t.scenarioId === row.scenarioId && t.agent === 'B' && t.pass) ?? run.trials.find((t) => t.scenarioId === row.scenarioId && t.agent === 'B');
  return a && b ? { row, a, b } : null;
}
const clip = (s: string, n: number) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t; };

export default function Home() {
  const { status, run, summary } = useRun();
  const rows = useMemo(() => (run ? scenarioRows(run) : []), [run]);
  const evidence = useMemo(() => (run ? pickEvidence(run, rows) : null), [run, rows]);
  const notes = useMemo(() => (run && summary ? insights(run, summary.A, summary.B, rows, summary.judge) : []), [run, summary, rows]);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="stack-lg">
            <div className="stack">
              <h1>Test, debug, and improve AI voice agents</h1>
              <p className="lead">Run real conversations, inspect tool calls, replay failures, and compare agent versions in one place.</p>
            </div>
            <div className="cta-row">
              <a className="btn" href={href({ section: 'live' })}>Try Live Agent <svg viewBox="0 0 24 24" width="18" height="18" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }} aria-hidden="true"><path d="M5 12h14m-6-6l6 6-6 6" /></svg></a>
              <a className="btn secondary" href={href({ section: 'overview' })}>View Evaluation Results</a>
              <a className="textlink" href={href({ section: 'how' })}>See How It Works</a>
            </div>
            <ul className="trust" aria-label="What this is">
              {TRUST.map((t) => <li key={t}><Icon name="check" />{t}</li>)}
            </ul>
          </div>
          <div aria-live="polite">
            {status === 'loading' ? <Skeleton height={360} /> : run && evidence ? <Evidence run={run} ev={evidence} /> : null}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="why">
        <div className="wrap">
          <div className="section-head"><h2 id="why">Why teams need this</h2><p>Voice agents take real actions. Quality has to be something you can measure, not something you hope for.</p></div>
          <div className="grid-3">
            {PROBLEMS.map((p) => (
              <article key={p.title} className="feature"><IconBox name={p.icon} /><h3>{p.title}</h3><p>{p.body}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="what">
        <div className="wrap">
          <div className="section-head"><h2 id="what">What you can do here</h2><p>Four things, each one click away.</p></div>
          <div className="grid-4">
            {FEATURES.map((f) => (
              <a key={f.title} className="feature" href={href({ section: f.to })}>
                <IconBox name={f.icon} /><h3>{f.title}</h3><p>{f.body}</p><span className="textlink">{f.cta} <Icon name="arrow" /></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {run && summary ? (
        <section className="section" aria-labelledby="learned">
          <div className="wrap grid-2" style={{ alignItems: 'start', gap: 48 }}>
            <div className="section-head" style={{ marginBottom: 0 }}>
              <h2 id="learned">What the evidence shows</h2>
              <p>From {count(run.trials.length)} recorded conversations on {run.scenarioIds.length} scenarios with {run.model}. Total agent cost for the run: {usd(summary.A.costUsd + summary.B.costUsd)}.</p>
              <div className="cluster" style={{ marginTop: 8 }}>
                <a className="btn secondary" href={href({ section: 'overview' })}>Open the full overview</a>
                <a className="textlink" href={href({ section: 'scenarios' })}>Browse scenarios</a>
              </div>
            </div>
            <div>{notes.slice(0, 3).map((n) => <div className="insight" key={n.title}><h3>{n.title}</h3><p>{n.body}</p></div>)}</div>
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="wrap">
          <div className="cta-band">
            <div className="stack-sm" style={{ maxWidth: '52ch' }}>
              <h2>Start with the live agent</h2>
              <p className="ink2">Ask it to book a cleaning, then move the appointment. Every tool call and database change is visible as it happens.</p>
            </div>
            <div className="cta-row"><a className="btn" href={href({ section: 'live' })}>Try Live Agent</a><a className="textlink" href={href({ section: 'how' })}>What this demonstrates</a></div>
          </div>
        </div>
      </section>
    </>
  );
}

function Evidence({ run, ev }: { run: EvalRun; ev: { row: ScenarioRow; a: Trial; b: Trial } }) {
  const tools = (t: Trial) => [...new Set(t.turns.flatMap((x) => x.toolCalls.map((c) => c.name)))];
  const side = (t: Trial, agent: 'a' | 'b', results: boolean[]) => {
    const last = t.turns[t.turns.length - 1];
    const used = tools(t);
    return (
      <div className={`evidence-row ${agent}`}>
        <span className={`agent-dot ${agent}`} style={{ marginTop: 7 }} />
        <div className="stack-sm">
          <div className="cluster" style={{ gap: 10 }}>
            <strong>Agent {agent.toUpperCase()}</strong><TrialStrip results={results} label={`Agent ${agent.toUpperCase()}`} />
            <Badge tone={t.pass ? 'pass' : 'fail'}>{t.pass ? 'Pass' : 'Fail'}</Badge>
          </div>
          <p className="small ink2">“{clip(last.reply || last.error || '', 150)}”</p>
          <p className="tiny muted">Tool calls: {used.length ? used.join(', ') : 'none'}{!t.pass ? ` · missed: ${t.checks.filter((c) => !c.pass)[0]?.name ?? ''}` : ''}</p>
        </div>
      </div>
    );
  };
  return (
    <figure className="panel evidence" style={{ margin: 0 }}>
      <figcaption className="stack-sm">
        <span className="tiny muted" style={{ fontWeight: 600, letterSpacing: '0.04em' }}>FROM A REAL RUN · {run.model}</span>
        <h2 style={{ fontSize: '1.05rem' }}>{ev.row.title}</h2>
      </figcaption>
      <div className="evidence-row"><span className="muted tiny" style={{ paddingTop: 3 }}>Caller</span><p className="evidence-q">“{clip(ev.a.turns[0].user, 120)}”</p></div>
      {side(ev.a, 'a', ev.row.a.results)}
      {side(ev.b, 'b', ev.row.b.results)}
      <a className="textlink" href={href({ section: 'scenarios', param: ev.row.scenarioId })}>Open the full transcript and tool calls <Icon name="arrow" /></a>
    </figure>
  );
}
