// Build-time data access. The JSON files are committed to /data and imported directly,
// so the static build has everything it needs with no backend. All accessors are
// defensive: a missing/placeholder file just yields an empty list.
import fixturesJson from '../../data/fixtures.json';
import standingsJson from '../../data/standings.json';
import topscorersJson from '../../data/topscorers.json';
import topassistsJson from '../../data/topassists.json';
import playersJson from '../../data/players.json';
import type {
  FixturesFile,
  StandingsFile,
  ScorersFile,
  PlayersFile,
  Fixture,
  GroupStanding,
  ScorerEntry,
  PlayerAggregate,
  TeamRef,
} from './types';

export const fixturesFile = fixturesJson as unknown as FixturesFile;
export const standingsFile = standingsJson as unknown as StandingsFile;
export const topscorersFile = topscorersJson as unknown as ScorersFile;
export const topassistsFile = topassistsJson as unknown as ScorersFile;
export const playersFile = playersJson as unknown as PlayersFile;

export const fixtures: Fixture[] = fixturesFile.fixtures ?? [];
export const standings: GroupStanding[] = standingsFile.groups ?? [];
export const topscorers: ScorerEntry[] = topscorersFile.players ?? [];
export const topassists: ScorerEntry[] = topassistsFile.players ?? [];
export const players: PlayerAggregate[] = playersFile.players ?? [];

// Which player ids have a profile page (built from players.json by aggregate.mjs).
// Components link a player name only when its profile exists — no dead routes.
const playerMap = new Map<number, PlayerAggregate>(players.map((p) => [p.id, p]));
export const playerIds = new Set<number>(playerMap.keys());
export function getPlayer(id: number | string): PlayerAggregate | undefined {
  return playerMap.get(Number(id));
}

export const FINISHED = new Set(['FT', 'AET', 'PEN']);
export const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);

export function isFinished(f: Fixture): boolean {
  return f.finished || FINISHED.has(f.status?.short ?? '');
}
export function isLive(f: Fixture): boolean {
  return LIVE.has(f.status?.short ?? '');
}

// Group fixtures by calendar day (UTC date key) for the Home fixtures list.
export function fixturesByDate(list: Fixture[] = fixtures): { date: string; fixtures: Fixture[] }[] {
  const map = new Map<string, Fixture[]>();
  for (const f of list) {
    const key = (f.utcDate ?? '').slice(0, 10) || 'TBD';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, fx]) => ({
      date,
      fixtures: fx.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0)),
    }));
}

// Knockouts start at Round of 32; used to switch Standings between tables and a bracket.
const KNOCKOUT_ROUNDS = [
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  '3rd Place Final',
  'Final',
];
export function isKnockoutRound(round?: string | null): boolean {
  if (!round) return false;
  return KNOCKOUT_ROUNDS.some((r) => round.toLowerCase().includes(r.toLowerCase()));
}
export function hasKnockoutsStarted(list: Fixture[] = fixtures): boolean {
  return list.some((f) => isKnockoutRound(f.round) && (isFinished(f) || isLive(f)));
}

export function lastUpdated(): string | null {
  return fixturesFile.updatedAt ?? standingsFile.updatedAt ?? null;
}

export const season: number | null = fixturesFile.league?.season ?? null;

// The tournament winner, once the Final is decided. Uses the API winner flag, then the
// scoreline, then the penalty shootout — so a 3–3 (4–2 pen) Final resolves correctly.
export function champion(): { team: TeamRef; runnerUp: TeamRef; fixture: Fixture } | null {
  const final = fixtures.find((f) => f.round === 'Final' && isFinished(f));
  if (!final) return null;
  const { home, away } = final;
  let win: TeamRef | null =
    home.winner === true ? home : away.winner === true ? away : null;
  if (!win) {
    const hg = home.goals ?? 0;
    const ag = away.goals ?? 0;
    if (hg > ag) win = home;
    else if (ag > hg) win = away;
    else if (final.penalty) {
      const hp = final.penalty.home ?? 0;
      const ap = final.penalty.away ?? 0;
      win = hp > ap ? home : ap > hp ? away : null;
    }
  }
  if (!win) return null;
  return { team: win, runnerUp: win === home ? away : home, fixture: final };
}

// Tournament facts derived from the actual data, so the UI isn't hardcoded to one edition.
export function tournamentMeta() {
  const teams = new Set<string>();
  const venues = new Set<string>();
  for (const f of fixtures) {
    if (f.home?.name && f.home.name !== 'TBD') teams.add(f.home.name);
    if (f.away?.name && f.away.name !== 'TBD') teams.add(f.away.name);
    if (f.venue?.name) venues.add(f.venue.name);
  }
  const dated = fixtures
    .map((f) => f.utcDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  return {
    season,
    teamCount: teams.size,
    groupCount: standings.length,
    matchCount: fixtures.length,
    venueCount: venues.size,
    firstDate: dated[0] ?? null,
    lastDate: dated[dated.length - 1] ?? null,
  };
}

// A focused "what's on now" slice for the Home page: the most recent day that already
// has a finished/live match, plus the next few upcoming days — instead of all 104 rows.
export function currentFixtureWindow(
  list: Fixture[] = fixtures,
  { daysBefore = 1, daysAfter = 2 }: { daysBefore?: number; daysAfter?: number } = {}
): Fixture[] {
  const days = fixturesByDate(list);
  if (days.length === 0) return [];
  // Pivot = first day that is NOT fully finished (i.e. has upcoming/live games).
  let pivot = days.findIndex((d) => d.fixtures.some((f) => !isFinished(f)));
  if (pivot === -1) pivot = days.length - 1; // tournament over: show the last days
  const start = Math.max(0, pivot - daysBefore);
  const end = Math.min(days.length, pivot + daysAfter + 1);
  return days.slice(start, end).flatMap((d) => d.fixtures);
}

export function finishedFixtures(list: Fixture[] = fixtures): Fixture[] {
  return list.filter(isFinished);
}

export function fixtureById(id: number): Fixture | undefined {
  return fixtures.find((f) => f.id === id);
}
