import { lazy, Suspense, useEffect, useRef } from 'react';
import Home from '../views/Home';
import Overview from '../views/Overview';
import Scenarios from '../views/Scenarios';
import { href, useRoute, type Section } from './router';
import { RunProvider } from './RunContext';
import { Skeleton } from '../components/ui';

// Heavier or rarely used views load on demand.
const How = lazy(() => import('../views/How'));
const Method = lazy(() => import('../views/Method'));
const History = lazy(() => import('../views/History'));

const PAGES: Record<Section, { title: string; lead: string }> = {
  home: { title: 'Voice Agent Quality Lab', lead: '' },
  overview: { title: 'Evaluation overview', lead: '' },
  scenarios: { title: 'Scenarios', lead: 'Browse every scenario, compare the two agents, and open the transcript, tool calls and final database state behind each result.' },
  how: { title: 'How it works', lead: 'From a caller’s words to an evaluated, inspectable result.' },
  method: { title: 'Agents and method', lead: 'What differs between Agent A and Agent B, how pass and fail are decided, and what this cannot tell you.' },
  history: { title: 'Historical simulator', lead: 'The first version used rule-based programs, not an LLM. Kept for reference only.' },
};
const MAIN_NAV: { section: Section; label: string }[] = [
  { section: 'overview', label: 'Overview' }, { section: 'scenarios', label: 'Scenarios' }, { section: 'how', label: 'How it works' },
];
const MORE_NAV: { section: Section; label: string }[] = [{ section: 'method', label: 'Method' }, { section: 'history', label: 'Simulator v1' }];

export function App() { return <RunProvider><Shell /></RunProvider>; }

function Shell() {
  const [route] = useRoute();
  const page = PAGES[route.section];
  const first = useRef(true);

  useEffect(() => {
    document.title = route.section === 'home' ? 'Voice Agent Quality Lab · Test, debug and improve AI voice agents' : `${route.param ? `${route.param} · ` : ''}${page.title} · Voice Agent Quality Lab`;
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    // Move focus to the page's main heading so keyboard and screen-reader users land on the new content.
    (document.querySelector('main h1') as HTMLElement | null)?.focus();
  }, [route.section, route.param, page.title]);

  const link = (n: { section: Section; label: string }) => (
    <a key={n.section} href={href({ section: n.section })} aria-current={route.section === n.section ? 'page' : undefined}>{n.label}</a>
  );
  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="header">
        <div className="wrap header-in" style={{ display: 'flex', alignItems: 'center', gap: 24, minHeight: 'var(--header)' }}>
          <a className="logo" href={href({ section: 'home' })} aria-label="Voice Agent Quality Lab, home">
            <svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--ink)" /><path d="M8.5 16.5l4.5 4.5 10.5-11" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Voice Agent Quality Lab
          </a>
          <nav className="nav" aria-label="Primary">
            {MAIN_NAV.map(link)}<span className="sep" aria-hidden="true" />{MORE_NAV.map(link)}
          </nav>
          <a className="btn header-cta hide-sm" href={href({ section: 'overview' })}>View results</a>
        </div>
      </header>
      <main id="content">
        {route.section === 'home' ? <Home /> : (
          <div className="wrap page">
            {route.section !== 'overview' ? (
              <header className="page-head"><h1 tabIndex={-1}>{page.title}</h1>{page.lead ? <p>{page.lead}</p> : null}</header>
            ) : null}
            <Suspense fallback={<Skeleton height={240} />}>
              {route.section === 'overview' && <Overview />}
              {route.section === 'scenarios' && <Scenarios id={route.param} />}
              {route.section === 'how' && <How />}
              {route.section === 'method' && <Method />}
              {route.section === 'history' && <History />}
            </Suspense>
          </div>
        )}
      </main>
      <footer className="footer">
        <div className="wrap">
          <span>Independent portfolio project. Not affiliated with, built on, or approved by Regal. Synthetic data only.</span>
          <span><a href="https://github.com/Rishi-creator-11/voice-agent-quality-lab">Source on GitHub</a></span>
        </div>
      </footer>
    </>
  );
}
