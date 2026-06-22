// Pure mappers: raw API-Football envelopes -> the lean data contract in src/lib/types.ts.
// Everything is defensive — early-tournament responses are sparse and fields can be null.
import { codeFor, groupFor } from './teams.mjs';

const FINISHED = new Set(['FT', 'AET', 'PEN']);

export function normalizeRound(round) {
  if (!round) return 'Group Stage';
  const r = String(round).toLowerCase();
  if (r.includes('group')) return 'Group Stage';
  if (r.includes('round of 32')) return 'Round of 32';
  if (r.includes('round of 16')) return 'Round of 16';
  if (r.includes('quarter')) return 'Quarter-finals';
  if (r.includes('semi')) return 'Semi-finals';
  if (r.includes('3rd place') || r.includes('third place')) return '3rd Place Final';
  if (r.includes('final')) return 'Final';
  return round;
}

export function toUtcIso(dateStr, timestamp) {
  if (timestamp) return new Date(timestamp * 1000).toISOString();
  if (dateStr) {
    const d = new Date(dateStr);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return dateStr ?? null;
}

function teamRef(t, goals) {
  const name = t?.name ?? 'TBD';
  return {
    id: t?.id ?? null,
    name,
    code: codeFor(name),
    logo: t?.logo ?? null,
    goals: goals ?? null,
    winner: t?.winner ?? null,
  };
}

export function normalizeFixture(item) {
  const fx = item?.fixture ?? {};
  const lg = item?.league ?? {};
  const teams = item?.teams ?? {};
  const goals = item?.goals ?? {};
  const status = fx.status ?? {};
  const round = normalizeRound(lg.round);
  const short = status.short ?? 'NS';
  const group =
    round === 'Group Stage' ? (groupFor(teams.home?.name) ?? groupFor(teams.away?.name)) : null;
  const pen = item?.score?.penalty;
  const penalty =
    pen && (pen.home != null || pen.away != null)
      ? { home: pen.home ?? null, away: pen.away ?? null }
      : null;

  return {
    id: fx.id,
    utcDate: toUtcIso(fx.date, fx.timestamp),
    timestamp: fx.timestamp ?? null,
    venue: { name: fx.venue?.name ?? null, city: fx.venue?.city ?? null },
    round,
    rawRound: lg.round ?? null,
    group,
    penalty,
    status: { short, long: status.long ?? '', elapsed: status.elapsed ?? null },
    finished: FINISHED.has(short),
    home: teamRef(teams.home, goals.home),
    away: teamRef(teams.away, goals.away),
  };
}

export function normalizeFixtures(resp) {
  const list = (resp?.response ?? [])
    .map(normalizeFixture)
    .filter((f) => f.id != null);
  list.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return list;
}

export function normalizeStandings(resp) {
  const leagues = resp?.response ?? [];
  const tables = leagues[0]?.league?.standings ?? [];
  const groups = tables.map((table) => {
    const letter = (table?.[0]?.group ?? '').replace(/group/i, '').trim() || '?';
    return {
      letter,
      table: (table ?? []).map((row) => {
        const all = row?.all ?? {};
        const gf = all.goals?.for ?? 0;
        const ga = all.goals?.against ?? 0;
        return {
          rank: row?.rank ?? 0,
          team: {
            id: row?.team?.id ?? null,
            name: row?.team?.name ?? 'TBD',
            code: codeFor(row?.team?.name),
            logo: row?.team?.logo ?? null,
          },
          played: all.played ?? 0,
          win: all.win ?? 0,
          draw: all.draw ?? 0,
          lose: all.lose ?? 0,
          goalsFor: gf,
          goalsAgainst: ga,
          goalDiff: row?.goalsDiff ?? gf - ga,
          points: row?.points ?? 0,
          form: row?.form ?? null,
          description: row?.description ?? null,
        };
      }),
    };
  });
  groups.sort((a, b) => a.letter.localeCompare(b.letter));
  return groups;
}

// --- per-match (Phase 2) ---------------------------------------------------

// API stat "type" -> our normalized key. xG ("expected_goals") may be absent.
const STAT_KEYS = {
  'Shots on Goal': 'shotsOnTarget',
  'Shots off Goal': 'shotsOffTarget',
  'Total Shots': 'totalShots',
  'Blocked Shots': 'blockedShots',
  'Shots insidebox': 'shotsInsideBox',
  'Shots outsidebox': 'shotsOutsideBox',
  Fouls: 'fouls',
  'Corner Kicks': 'corners',
  Offsides: 'offsides',
  'Ball Possession': 'possession',
  'Yellow Cards': 'yellow',
  'Red Cards': 'red',
  'Goalkeeper Saves': 'saves',
  'Total passes': 'passes',
  'Passes accurate': 'passesAccurate',
  'Passes %': 'passAccuracy',
  expected_goals: 'xg',
};

function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace('%', '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? v : n;
}

function teamStatLine(entry) {
  const stats = {};
  for (const s of entry?.statistics ?? []) {
    const key = STAT_KEYS[s?.type];
    if (key) stats[key] = num(s.value);
  }
  return { teamId: entry?.team?.id ?? null, name: entry?.team?.name ?? 'TBD', stats };
}

function lineupPlayers(arr) {
  return (arr ?? []).map((x) => {
    const p = x?.player ?? {};
    return {
      id: p.id ?? null,
      name: p.name ?? 'Unknown',
      number: p.number ?? null,
      pos: p.pos ?? null,
      grid: p.grid ?? null,
    };
  });
}

export function normalizeMatch(fixture, { statistics, events, lineups, players } = {}) {
  const homeId = fixture?.home?.id ?? null;

  // Statistics come as [teamA, teamB]; order them home-first when we can.
  const statEntries = statistics?.response ?? [];
  const orderedStats = [...statEntries].sort((a, b) =>
    a?.team?.id === homeId ? -1 : b?.team?.id === homeId ? 1 : 0
  );

  const lineupEntries = (lineups?.response ?? []).map((l) => ({
    teamId: l?.team?.id ?? null,
    name: l?.team?.name ?? 'TBD',
    formation: l?.formation ?? null,
    coach: l?.coach?.name ?? null,
    startXI: lineupPlayers(l?.startXI),
    subs: lineupPlayers(l?.substitutes),
  }));
  lineupEntries.sort((a, b) => (a.teamId === homeId ? -1 : b.teamId === homeId ? 1 : 0));

  const playerStats = [];
  for (const teamBlock of players?.response ?? []) {
    const teamId = teamBlock?.team?.id ?? null;
    for (const pr of teamBlock?.players ?? []) {
      const st = (pr?.statistics ?? [])[0] ?? {};
      const ratingRaw = st.games?.rating;
      playerStats.push({
        id: pr?.player?.id ?? null,
        name: pr?.player?.name ?? 'Unknown',
        teamId,
        number: st.games?.number ?? null,
        pos: st.games?.position ?? null,
        minutes: st.games?.minutes ?? null,
        rating: ratingRaw == null ? null : Number(ratingRaw),
        goals: st.goals?.total ?? 0,
        assists: st.goals?.assists ?? 0,
        shots: st.shots?.total ?? 0,
        shotsOnTarget: st.shots?.on ?? 0,
        yellow: st.cards?.yellow ?? 0,
        red: st.cards?.red ?? 0,
      });
    }
  }

  const eventList = (events?.response ?? []).map((e) => ({
    minute: e?.time?.elapsed ?? null,
    extra: e?.time?.extra ?? null,
    teamId: e?.team?.id ?? null,
    teamName: e?.team?.name ?? null,
    player: e?.player?.name ?? null,
    playerId: e?.player?.id ?? null,
    assist: e?.assist?.name ?? null,
    assistId: e?.assist?.id ?? null,
    type: e?.type ?? '',
    detail: e?.detail ?? '',
  }));

  return {
    fixtureId: fixture?.id,
    fetchedAt: new Date().toISOString(),
    teams: { home: fixture?.home ?? null, away: fixture?.away ?? null },
    statsByTeam: orderedStats.map(teamStatLine),
    events: eventList,
    lineups: lineupEntries,
    players: playerStats,
  };
}

export function normalizeScorers(resp) {
  return (resp?.response ?? []).map((p) => {
    const st = (p?.statistics ?? [])[0] ?? {};
    return {
      player: {
        id: p?.player?.id ?? 0,
        name: p?.player?.name ?? 'Unknown',
        photo: p?.player?.photo ?? null,
      },
      team: {
        id: st.team?.id ?? null,
        name: st.team?.name ?? 'TBD',
        code: codeFor(st.team?.name),
        logo: st.team?.logo ?? null,
      },
      goals: st.goals?.total ?? 0,
      assists: st.goals?.assists ?? 0,
      minutes: st.games?.minutes ?? null,
      appearances: st.games?.appearences ?? st.games?.appearances ?? null,
      penalties: st.penalty?.scored ?? null,
    };
  });
}
