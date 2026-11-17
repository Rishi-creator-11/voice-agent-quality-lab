import { useCallback, useEffect, useState } from 'react';

export type Section = 'overview' | 'scenarios' | 'live' | 'run' | 'method' | 'history';
export interface Route { section: Section; param?: string }
const SECTIONS: Section[] = ['overview', 'scenarios', 'live', 'run', 'method', 'history'];

/** Hash routes keep deep links, back/forward and reload working on static hosting. */
export function parseHash(hash: string): Route {
  const [section, param] = hash.replace(/^#\/?/, '').split('/');
  return SECTIONS.includes(section as Section)
    ? { section: section as Section, param: param ? decodeURIComponent(param) : undefined }
    : { section: 'overview' };
}
export const href = (r: Route) => `#/${r.section}${r.param ? `/${encodeURIComponent(r.param)}` : ''}`;

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: Route) => { window.location.hash = href(r); }, []);
  return [route, go];
}
