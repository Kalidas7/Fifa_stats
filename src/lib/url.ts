// Base-path-agnostic link builder. Astro injects import.meta.env.BASE_URL from the
// `base` config (default "/"). Using this everywhere means the same build works at the
// domain root (Cloudflare/Vercel/Netlify) OR under a sub-path (GitHub Pages project site).
const BASE: string = import.meta.env.BASE_URL || '/';

export function withBase(path = '/'): string {
  const b = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}` || '/';
}

export const links = {
  home: () => withBase('/'),
  matches: () => withBase('/matches'),
  standings: () => withBase('/standings'),
  match: (id: number | string) => withBase(`/match/${id}`),
  player: (id: number | string) => withBase(`/player/${id}`),
};
