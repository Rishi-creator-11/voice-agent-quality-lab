import { lazy, Suspense, useEffect, useRef } from 'react';
import { Icon } from '../components/ui';
import Overview from '../views/Overview';
import Scenarios from '../views/Scenarios';
import { href, useRoute, type Section } from './router';
import { RunProvider } from './RunContext';

// Rarely-used or heavy views load on demand to keep the first paint small.
const Playground = lazy(() => import('../views/Playground'));
const Runner = lazy(() => import('../views/Runner'));
const Method = lazy(() => import('../views/Method'));
const History = lazy(() => import('../views/History'));

const NAV: { section: Section; label: string; title: string; lead: string }[] = [
  { section: 'overview', label: 'Overview', title: 'Results', lead: 'Two real LLM agents, one fictional dental clinic. Every number is computed from recorded conversations.' },
  { section: 'scenarios', label: 'Scenarios', title: 'Scenarios', lead: 'Each scenario run against both agents. Open one for the checks, database changes and full transcript.' },
  { section: 'live', label: 'Live agent', title: 'Live agent', lead: 'Talk to Agent A or B. The model chooses tools; backend code executes them against a sandbox database.' },
  { section: 'run', label: 'Run evaluation', title: 'Run evaluation', lead: 'Operator tool: run scenarios against both agents on the server and load the recorded results.' },
  { section: 'method', label: 'Agents & method', title: 'Agents and method', lead: 'What differs between A and B, how pass and fail are decided, and what this cannot tell you.' },
  { section: 'history', label: 'Simulator (v1)', title: 'Historical simulator', lead: 'The first version used rule-based programs, not an LLM. Kept for reference only.' },
];

export function App() {
  return <RunProvider><Shell /></RunProvider>;
}

function Shell() {
  const [route] = useRoute();
  const page = NAV.find((n) => n.section === route.section)!;
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    document.title = `${route.param ? `${route.param} · ` : ''}${page.title} · Voice Agent Quality Lab`;
    if (first.current) { first.current = false; return; }
    heading.current?.focus(); // move focus to the new page for keyboard and screen-reader users
    window.scrollTo(0, 0);
  }, [route.section, route.param, page.title]);

  return (
    <div className="app">
      <a className="skip" href="#content">Skip to content</a>
      <aside className="side">
        <div className="brand"><strong>Voice Agent Quality Lab</strong><span>LLM agent evaluation</span></div>
        <nav className="nav" aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.section} href={href({ section: n.section })} aria-current={route.section === n.section ? 'page' : undefined}><Icon name={n.section} />{n.label}</a>
          ))}
        </nav>
        <div className="side-foot">
          <span>Independent portfolio project. Not affiliated with, built on, or approved by Regal.</span>
          <a href="https://github.com/Rishi-creator-11/voice-agent-quality-lab">Source on GitHub</a>
        </div>
      </aside>
      <main className="main" id="content">
        <header className="page-head">
          <h1 ref={heading} tabIndex={-1}>{page.title}</h1>
          <p>{page.lead}</p>
        </header>
        <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
          {route.section === 'overview' && <Overview />}
          {route.section === 'scenarios' && <Scenarios id={route.param} />}
          {route.section === 'live' && <Playground />}
          {route.section === 'run' && <Runner />}
          {route.section === 'method' && <Method />}
          {route.section === 'history' && <History />}
        </Suspense>
      </main>
    </div>
  );
}
