import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export type Tone = 'pass' | 'fail' | 'warn' | 'neutral' | 'accent';
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) { return <span className={`badge ${tone}`}>{children}</span>; }
export const PassBadge = ({ pass }: { pass: boolean }) => <Badge tone={pass ? 'pass' : 'fail'}>{pass ? 'Pass' : 'Fail'}</Badge>;
export const Tag = ({ children, fail }: { children: ReactNode; fail?: boolean }) => <span className={fail ? 'tag fail' : 'tag'}>{children}</span>;

/** Compound panel: <Panel><Panel.Head title="…" /><Panel.Body>…</Panel.Body></Panel> */
export function Panel({ children, soft }: { children: ReactNode; soft?: boolean }) { return <section className={soft ? 'panel soft' : 'panel'}>{children}</section>; }
Panel.Head = function PanelHead({ title, aside, level = 2 }: { title: string; aside?: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3';
  return <div className="panel-head"><H style={level === 2 ? { fontSize: '1.05rem' } : undefined}>{title}</H>{aside ? <div className="muted small">{aside}</div> : null}</div>;
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

/** Loading placeholder that keeps layout stable. */
export function Skeleton({ height = 120 }: { height?: number }) { return <div className="skeleton" style={{ height }} aria-hidden="true" />; }

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

/** Segmented single-choice control (radiogroup semantics with arrow-key navigation). */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + options.length) % options.length;
    onChange(options[n].value);
    (ref.current?.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} tabIndex={value === o.value ? 0 : -1} disabled={disabled}
          onClick={() => onChange(o.value)} onKeyDown={(e) => move(e, i)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Accessible tabs: roving tabindex, arrow keys, Home/End. Panels are rendered by the caller via `children`. */
export function Tabs<T extends string>({ label, value, tabs, onChange, idPrefix, children }: { label: string; value: T; tabs: { value: T; label: string }[]; onChange: (v: T) => void; idPrefix: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent, i: number) => {
    let n = i;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1; else return;
    e.preventDefault(); onChange(tabs[n].value);
    (ref.current?.querySelectorAll('button')[n] as HTMLButtonElement | undefined)?.focus();
  };
  return (
    <div>
      <div className="tabs" role="tablist" aria-label={label} ref={ref}>
        {tabs.map((t, i) => (
          <button key={t.value} type="button" role="tab" id={`${idPrefix}-tab-${t.value}`} aria-selected={value === t.value} aria-controls={`${idPrefix}-panel`}
            tabIndex={value === t.value ? 0 : -1} onClick={() => onChange(t.value)} onKeyDown={(e) => move(e, i)}>{t.label}</button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`${idPrefix}-panel`} aria-labelledby={`${idPrefix}-tab-${value}`} tabIndex={0}>{children}</div>
    </div>
  );
}

/** Expandable tool-call event: status, name, when, and full input/result. */
export function EventCard({ name, ok, when, input, result }: { name: string; ok: boolean; when: string; input: unknown; result: unknown }) {
  return (
    <details className="ev">
      <summary>
        <span className={ok ? 'dot' : 'dot bad'} role="img" aria-label={ok ? 'Succeeded' : 'Returned an error'} />
        <span className="ev-name">{name}</span>
        <span className="ev-time">{when}</span>
      </summary>
      <div className="ev-body">
        <div><h4>Input</h4><pre className="json">{JSON.stringify(input, null, 2)}</pre></div>
        <div><h4>Result</h4><pre className="json">{JSON.stringify(result, null, 2)}</pre></div>
      </div>
    </details>
  );
}

const ICONS: Record<string, string> = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  run: 'M7 4l12 8-12 8z',
  inspect: 'M4 6h16M4 12h10M4 18h7m6-5.5a3 3 0 1 0 0 .01M21 21l-2.2-2.2',
  compare: 'M9 4v16M15 4v16M4 9h5M15 15h5',
  live: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  alert: 'M12 4l9 16H3zm0 6v4m0 3h.01',
  layers: 'M12 3l9 5-9 5-9-5zm-9 9l9 5 9-5',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  plug: 'M9 3v5m6-5v5M7 8h10v3a5 5 0 0 1-10 0zm5 8v5',
  bug: 'M9 9h6v7a3 3 0 0 1-6 0zm3-5v2M5 10h4m6 0h4M5 16h4m6 0h4',
  trend: 'M4 18l6-6 4 4 6-8M15 8h5v5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  arrow: 'M5 12h14m-6-6l6 6-6 6',
};
export function Icon({ name }: { name: keyof typeof ICONS | string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[name] ?? ICONS.check} /></svg>;
}
export const IconBox = ({ name }: { name: string }) => <span className="icon-box"><Icon name={name} /></span>;
