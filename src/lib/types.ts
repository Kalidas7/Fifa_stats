// Data contract shared by the fetcher (scripts/fetch.mjs), the aggregator
// (scripts/aggregate.mjs) and the Astro site. The fetcher NORMALIZES API-Football
// responses into these lean shapes so the UI never couples to the raw API.
// Every field is defensively optional — early-tournament responses are sparse.

export interface TeamRef {
  id: number | null;
  name: string;
  code: string | null; // FIFA trigram (from teams.json / API), e.g. "BRA"
  logo: string | null;
  goals?: number | null;
  winner?: boolean | null; // API winner flag (true/false/null) — decides ties on pens
}

export interface FixtureStatus {
  short: string; // NS, 1H, HT, 2H, ET, BT, P, FT, AET, PEN, PST, CANC, ...
  long: string;
  elapsed: number | null;
}

export interface Fixture {
  id: number;
  utcDate: string; // ISO-8601 UTC kickoff
  timestamp: number | null; // unix seconds
  venue: { name: string | null; city: string | null };
  round: string; // "Group Stage" | "Round of 32" | "Round of 16" | "Quarter-finals" | "Semi-finals" | "3rd Place Final" | "Final"
  rawRound?: string | null; // original API round, e.g. "Group Stage - 1" (matchday)
  group: string | null; // "A".."L" for group stage, else null
  penalty?: { home: number | null; away: number | null } | null; // shootout score, if any
  status: FixtureStatus;
  finished: boolean; // derived: status.short in {FT, AET, PEN}
  home: TeamRef;
  away: TeamRef;
}

export interface FixturesFile {
  updatedAt: string | null;
  league: { id: number; season: number };
  fixtures: Fixture[];
}

export interface StandingRow {
  rank: number;
  team: TeamRef;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: string | null; // e.g. "WDLWW"
  description: string | null; // qualification note from API, if any
}

export interface GroupStanding {
  letter: string; // "A".."L"
  table: StandingRow[];
}

export interface StandingsFile {
  updatedAt: string | null;
  groups: GroupStanding[];
}

export interface ScorerEntry {
  player: { id: number; name: string; photo: string | null };
  team: TeamRef;
  goals: number;
  assists: number;
  minutes: number | null;
  appearances: number | null;
  penalties: number | null;
}

export interface ScorersFile {
  updatedAt: string | null;
  players: ScorerEntry[];
}

// ---- Per-match file: data/matches/{id}.json (Phase 2) ----

export interface TeamStatLine {
  teamId: number | null;
  name: string;
  // Normalized, lowercased stat keys -> value. xG may be absent; never assume it.
  stats: Record<string, number | string | null>;
}

export interface MatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number | null;
  teamName: string | null;
  player: string | null;
  playerId: number | null;
  assist: string | null;
  assistId: number | null;
  type: string; // Goal | Card | subst | Var
  detail: string; // "Normal Goal" | "Yellow Card" | "Penalty" | ...
}

export interface LineupPlayer {
  id: number | null;
  name: string;
  number: number | null;
  pos: string | null; // G/D/M/F
  grid: string | null; // "row:col" from API for pitch placement
}

export interface TeamLineup {
  teamId: number | null;
  name: string;
  formation: string | null; // "4-3-3"
  coach: string | null;
  startXI: LineupPlayer[];
  subs: LineupPlayer[];
}

export interface MatchPlayerStat {
  id: number | null;
  name: string;
  teamId: number | null;
  number: number | null;
  pos: string | null;
  minutes: number | null;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  yellow: number;
  red: number;
}

export interface MatchFile {
  fixtureId: number;
  fetchedAt: string | null;
  teams: { home: TeamRef; away: TeamRef };
  statsByTeam: TeamStatLine[]; // [home, away]
  events: MatchEvent[];
  lineups: TeamLineup[];
  players: MatchPlayerStat[];
}

// ---- players.json (computed aggregates, Phase 3) ----

export interface PlayerMatchLog {
  fixtureId: number;
  date: string | null;
  opponent: string | null;
  minutes: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  rating: number | null;
  yellow: number;
  red: number;
}

export interface PlayerAggregate {
  id: number;
  name: string;
  photo: string | null;
  team: TeamRef;
  appearances: number;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  minutes: number;
  yellow: number;
  red: number;
  avgRating: number | null;
  log: PlayerMatchLog[];
}

export interface PlayersFile {
  updatedAt: string | null;
  players: PlayerAggregate[];
}

export interface Manifest {
  fetched: number[];
  lastRun: string | null;
  rateRemaining: number | null;
}

// teams.json: team common-name -> theme
export interface TeamTheme {
  primary: string;
  secondary: string;
  code: string;
  group: string;
}
