import teamsJson from '../../data/teams.json';
import type { TeamTheme } from './types';

const THEMES = teamsJson as Record<string, TeamTheme>;

// Normalize for tolerant matching: strip accents/punctuation, lowercase, collapse spaces.
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const byNorm = new Map<string, TeamTheme>();
const byCode = new Map<string, TeamTheme>();
for (const [name, theme] of Object.entries(THEMES)) {
  byNorm.set(norm(name), theme);
  if (theme.code) byCode.set(theme.code.toUpperCase(), theme);
}

// API-Football / broadcast naming variants -> our canonical key (normalized form).
const ALIASES: Record<string, string> = {
  usa: 'united states',
  'united states of america': 'united states',
  'korea republic': 'south korea',
  'czech republic': 'czechia',
  turkiye: 'turkey',
  'cote d ivoire': 'ivory coast',
  'cabo verde': 'cape verde',
  'congo dr': 'dr congo',
  'democratic republic of the congo': 'dr congo',
  'bosnia herzegovina': 'bosnia and herzegovina',
};

// Neutral fallback uses the site accent so unknown teams still render cleanly.
export const FALLBACK_THEME: TeamTheme = {
  primary: '#27c267',
  secondary: '#0e1713',
  code: '',
  group: '',
};

export function teamTheme(nameOrCode?: string | null): TeamTheme {
  if (!nameOrCode) return FALLBACK_THEME;
  const n = norm(nameOrCode);
  if (byNorm.has(n)) return byNorm.get(n)!;
  const aliased = ALIASES[n];
  if (aliased && byNorm.has(aliased)) return byNorm.get(aliased)!;
  const up = nameOrCode.toUpperCase();
  if (byCode.has(up)) return byCode.get(up)!;
  return FALLBACK_THEME;
}

export function teamCode(name?: string | null): string {
  const t = teamTheme(name);
  if (t.code) return t.code;
  return name ? name.slice(0, 3).toUpperCase() : '';
}

// Relative luminance (0..1) — lets the UI pick a readable accent for near-white kits.
export function luminance(hex: string): number {
  const m = hex.replace('#', '');
  if (m.length < 6) return 0.5;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// A team accent guaranteed to read on the dark stadium background: if the kit's
// primary is very light (e.g. Germany/England white), fall back to its secondary.
export function readableAccent(theme: TeamTheme): string {
  if (luminance(theme.primary) > 0.75 && luminance(theme.secondary) <= 0.75) {
    return theme.secondary;
  }
  return theme.primary;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  if (m.length < 6) return [128, 128, 128];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}

function colorDist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// Pick distinct accents for a head-to-head: if both kits read the same colour (e.g. a
// red-vs-red clash), the away side swaps to its secondary, or a neutral chalk fallback.
export function matchAccents(
  homeName?: string | null,
  awayName?: string | null
): { home: string; away: string } {
  const home = readableAccent(teamTheme(homeName));
  const at = teamTheme(awayName);
  let away = readableAccent(at);
  if (colorDist(home, away) < 80) {
    away = colorDist(home, at.secondary) >= 80 ? at.secondary : '#cfd8e3';
  }
  return { home, away };
}

export const allThemes = THEMES;
