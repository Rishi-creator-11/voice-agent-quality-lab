export const Pill = ({ pass, label }: { pass: boolean; label?: string }) => <span className={`pill ${pass ? 'pass' : 'fail'}`}>{label ?? (pass ? 'PASS' : 'FAIL')}</span>;
export const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
export const usd = (x: number) => `$${x.toFixed(x < 0.1 ? 4 : 2)}`;
export const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${x.toFixed(0)} ms`);
