// Loads every committed per-match file (data/matches/{id}.json) at build time via Vite's
// glob. Used by getStaticPaths for /match/[id] and to know which fixtures are clickable.
import type { MatchFile } from './types';

const modules = import.meta.glob('../../data/matches/*.json', { eager: true });

const map = new Map<number, MatchFile>();
for (const [path, mod] of Object.entries(modules)) {
  const m = ((mod as { default?: MatchFile }).default ?? mod) as MatchFile;
  const fromName = Number(path.split('/').pop()?.replace('.json', ''));
  const id = (m?.fixtureId ?? fromName) as number;
  if (id != null && !Number.isNaN(id)) map.set(Number(id), m);
}

export const matchMap = map;
export const matchIds = new Set<number>(map.keys());

export function getMatch(id: number | string): MatchFile | undefined {
  return map.get(Number(id));
}
export function allMatches(): MatchFile[] {
  return [...map.values()];
}
export function hasMatch(id: number | string): boolean {
  return map.has(Number(id));
}
