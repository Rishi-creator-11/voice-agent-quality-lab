import type { ReactNode } from 'react';

export type Tone = 'pass' | 'fail' | 'warn' | 'neutral';
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export const PassBadge = ({ pass }: { pass: boolean }) => <Badge tone={pass ? 'pass' : 'fail'}>{pass ? 'Pass' : 'Fail'}</Badge>;

/** Compound panel: <Panel><Panel.Head title="…" /><Panel.Body>…</Panel.Body></Panel> */
export function Panel({ children }: { children: ReactNode }) { return <section className="panel">{children}</section>; }
Panel.Head = function PanelHead({ title, aside, level = 2 }: { title: string; aside?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return <div className="panel-head"><H>{title}</H>{aside ? <div className="muted small">{aside}</div> : null}</div>;
};
Panel.Body = function PanelBody({ children }: { children: ReactNode }) { return <div className="panel-body">{children}</div>; };
Panel.Table = function PanelTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>{children}</div>;
};

export function Notice({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'warn' | 'bad'; title: string; children?: ReactNode }) {
  return (
    <div className={tone === 'neutral' ? 'notice' : `notice ${tone}`} role="status">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Trial strip: one square per trial. Shape (check / cross) and color both carry the result. */
export function TrialStrip({ results, label }: { results: boolean[]; label: string }) {
  const passed = results.filter(Boolean).length;
  return (
    <span className="strip" role="img" aria-label={`${label}: ${passed} of ${results.length} trials passed`}>
      {results.map((p, i) => <i key={i} className={p ? 'p' : 'f'} />)}
    </span>
  );
}

export function RateBar({ value, agent }: { value: number; agent: 'a' | 'b' }) {
  return <span className="rate-bar" aria-hidden="true"><i className={agent} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></span>;
}

const ICONS: Record<string, string> = {
  overview: 'M4 13h6V4H4zm10 7h6V4h-6zM4 20h6v-4H4z',
  scenarios: 'M4 6h16M4 12h16M4 18h10',
  live: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  run: 'M7 4l12 8-12 8z',
  method: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v5l3 2',
};
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>;
}
