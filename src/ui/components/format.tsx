const NBSP = ' ';
const nf = new Intl.NumberFormat('en-US');
export const pct = (x: number | null) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
export const usd = (x: number) => `$${x.toFixed(x < 0.1 ? 4 : 2)}`;
export const ms = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)}${NBSP}s` : `${x.toFixed(0)}${NBSP}ms`);
export const count = (n: number) => nf.format(n);
export const when = (iso: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
