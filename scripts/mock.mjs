#!/usr/bin/env node
// Demo-data generator. Writes believable /data so the site is fully demonstrable
// WITHOUT an API key (and lets us verify rendering). The real scripts/fetch.mjs
// overwrites these with live data. Deterministic (seeded) so output is stable.
//
//   npm run mock
//
import { readdirSync, unlinkSync } from 'node:fs';
import { writeJSON, dataPath, matchPath, MATCHES } from './lib/io.mjs';
import { TEAMS } from './lib/teams.mjs';

// Stage: 'group' (default) sits mid-group-stage; 'ko' advances to the knockout bracket.
//   MOCK_STAGE=ko npm run mock
const STAGE = process.env.MOCK_STAGE === 'ko' ? 'ko' : 'group';
const NOW = new Date(STAGE === 'ko' ? '2026-07-10T22:00:00Z' : '2026-06-18T19:30:00Z').getTime();

// Deterministic PRNG (mulberry32).
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = makeRng(260626);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const TBD = () => ({ id: null, name: 'TBD', code: null, logo: null, goals: null });

// --- group -> [teams] from the verified draw ---
const byGroup = {};
for (const [name, t] of Object.entries(TEAMS)) {
  (byGroup[t.group] ??= []).push({ name, ...t });
}
const letters = Object.keys(byGroup).sort();

function teamRef(t, goals = null) {
  return { id: t.code ? hashId(t.code) : null, name: t.name, code: t.code, logo: null, goals };
}
function hashId(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 100000;
}
function iso(day, hourUtc) {
  return new Date(Date.UTC(2026, 5, day, hourUtc, 0, 0)).toISOString();
}

// Round-robin pairings for a 4-team group across 3 matchdays.
const RR = [
  [[0, 1], [2, 3]], // MD1
  [[0, 2], [3, 1]], // MD2
  [[3, 0], [1, 2]], // MD3
];
// Each matchday's groups are spread across 4 days (3 groups/day, 2 slots each).
const MD_DAYS = { 0: [11, 12, 13, 14], 1: [17, 18, 19, 20], 2: [24, 25, 26, 27] };
const SLOTS = [16, 19];

const VENUES = [
  'MetLife Stadium',
  'SoFi Stadium',
  'AT&T Stadium',
  'Mercedes-Benz Stadium',
  'Hard Rock Stadium',
  'Lincoln Financial Field',
  'Levi’s Stadium',
  'NRG Stadium',
  'Arrowhead Stadium',
  'Lumen Field',
  'Gillette Stadium',
  'BMO Field',
  'BC Place',
  'Estadio Azteca',
  'Estadio Akron',
  'Estadio BBVA',
];

// Generic international surnames for synthetic squads (real stars get seeded per team below).
const SURNAMES = [
  'Silva', 'Müller', 'Rossi', 'García', 'Andersen', 'Kovač', 'Tanaka', 'Okafor', 'Nguyen',
  'Hassan', 'Novák', 'Costa', 'Schneider', 'Ferreira', 'Lindholm', 'Petrović', 'Diallo', 'Park',
  'Moreno', 'Bianchi', 'Walsh', 'Bauer', 'Sørensen', 'Marković', 'Mensah', 'Haddad', 'Suzuki',
  'Romero', 'Dubois', 'Fischer', 'Kaur', 'Oliveira', 'Larsson', 'Horvat', 'Traoré', 'Khan',
  'Castro', 'Greco', 'Murphy', 'Wagner', 'Eriksen', 'Jovanović', 'Abara', 'Ali', 'Reyes',
];
const INITIALS = 'ABCDEFGHJKLMNOPRSTV'.split('');

// 4-3-3 starting shape with API-style "row:col" grids (row 1 = keeper).
const FORMATION_433 = [
  { pos: 'G', grid: '1:1' },
  { pos: 'D', grid: '2:1' }, { pos: 'D', grid: '2:2' }, { pos: 'D', grid: '2:3' }, { pos: 'D', grid: '2:4' },
  { pos: 'M', grid: '3:1' }, { pos: 'M', grid: '3:2' }, { pos: 'M', grid: '3:3' },
  { pos: 'F', grid: '4:1' }, { pos: 'F', grid: '4:2' }, { pos: 'F', grid: '4:3' },
];
// Fill order so real stars (front of the name list) land in attacking slots.
const SLOT_PRIORITY = [8, 9, 10, 5, 6, 7, 1, 2, 3, 4, 0];

const fixtures = [];
let fid = 730000;

letters.forEach((letter, gi) => {
  const teams = byGroup[letter];
  for (let md = 0; md < 3; md++) {
    const day = MD_DAYS[md][Math.floor(gi / 3)];
    RR[md].forEach(([a, b], slotIdx) => {
      const kickoff = iso(day, SLOTS[slotIdx]);
      const ts = new Date(kickoff).getTime();
      let status;
      let hg = null;
      let ag = null;
      if (ts + 105 * 60000 < NOW) {
        // finished
        hg = scoreFor(rnd);
        ag = scoreFor(rnd);
        status = { short: 'FT', long: 'Match Finished', elapsed: 90 };
      } else if (ts <= NOW && ts + 105 * 60000 >= NOW) {
        const elapsed = Math.min(90, Math.max(1, Math.round((NOW - ts) / 60000)));
        hg = scoreFor(rnd, 0.6);
        ag = scoreFor(rnd, 0.6);
        status = { short: elapsed > 45 ? '2H' : '1H', long: 'In Play', elapsed };
      } else {
        status = { short: 'NS', long: 'Not Started', elapsed: null };
      }
      fixtures.push({
        id: fid++,
        utcDate: kickoff,
        timestamp: Math.floor(ts / 1000),
        venue: { name: pick(VENUES), city: null },
        round: 'Group Stage',
        rawRound: `Group Stage - ${md + 1}`,
        group: letter,
        status,
        finished: status.short === 'FT',
        home: teamRef(teams[a], hg),
        away: teamRef(teams[b], ag),
      });
    });
  }
});

function scoreFor(r, lambda = 1.3) {
  // small Poisson-ish goal count
  const x = r();
  if (x < Math.exp(-lambda)) return 0;
  if (x < 0.55) return 1;
  if (x < 0.8) return 2;
  if (x < 0.93) return 3;
  return 4;
}

// --- standings computed from finished group games ---
const groups = letters.map((letter) => {
  const teams = byGroup[letter];
  const rows = teams.map((t) => ({
    name: t.name,
    code: t.code,
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    form: '',
  }));
  const idx = Object.fromEntries(teams.map((t, i) => [t.name, i]));
  for (const f of fixtures) {
    if (f.group !== letter || !f.finished) continue;
    const h = rows[idx[f.home.name]];
    const a = rows[idx[f.away.name]];
    const hg = f.home.goals ?? 0;
    const ag = f.away.goals ?? 0;
    h.played++; a.played++;
    h.goalsFor += hg; h.goalsAgainst += ag;
    a.goalsFor += ag; a.goalsAgainst += hg;
    if (hg > ag) { h.win++; h.points += 3; h.form += 'W'; a.lose++; a.form += 'L'; }
    else if (hg < ag) { a.win++; a.points += 3; a.form += 'W'; h.lose++; h.form += 'L'; }
    else { h.draw++; a.draw++; h.points++; a.points++; h.form += 'D'; a.form += 'D'; }
  }
  rows.sort(
    (x, y) =>
      y.points - x.points ||
      (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) ||
      y.goalsFor - x.goalsFor ||
      x.name.localeCompare(y.name)
  );
  return {
    letter,
    table: rows.map((r, i) => ({
      rank: i + 1,
      team: { id: hashId(r.code || r.name), name: r.name, code: r.code, logo: null },
      played: r.played,
      win: r.win,
      draw: r.draw,
      lose: r.lose,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalsFor - r.goalsAgainst,
      points: r.points,
      form: r.form || null,
      description: i < 2 ? 'Advances to knockout stage' : null,
    })),
  };
});

// --- Knockout bracket ---
function koRef(t, goals) {
  return { id: t.id ?? hashId(t.code || t.name), name: t.name, code: t.code ?? null, logo: null, goals };
}
function decisive(r) {
  let h = scoreFor(r);
  let a = scoreFor(r);
  while (h === a) a = scoreFor(r); // knockouts can't end level (mock skips the pens detail)
  return [h, a];
}
function simKO(qualTeams, nowMs) {
  const rounds = [
    { round: 'Round of 32', month: 5, days: [28, 29, 30] },
    { round: 'Round of 16', month: 6, days: [4, 5, 6, 7] },
    { round: 'Quarter-finals', month: 6, days: [9, 10, 11] },
    { round: 'Semi-finals', month: 6, days: [14, 15] },
    { round: 'Final', month: 6, days: [19] },
  ];
  const out = [];
  let pairs = [];
  for (let i = 0; i < qualTeams.length / 2; i++) pairs.push([qualTeams[i], qualTeams[qualTeams.length - 1 - i]]);
  let semiLosers = [];
  for (const rd of rounds) {
    const winners = [];
    const losers = [];
    pairs.forEach(([h, a], i) => {
      const day = rd.days[i % rd.days.length];
      const kickoff = new Date(Date.UTC(2026, rd.month, day, i % 2 ? 19 : 16, 0, 0)).toISOString();
      const ts = new Date(kickoff).getTime();
      const known = h && a && h.name !== 'TBD' && a.name !== 'TBD';
      const finished = known && ts + 105 * 60000 < nowMs;
      let hg = null;
      let ag = null;
      let win = { name: 'TBD' };
      let lose = { name: 'TBD' };
      let status = { short: 'NS', long: 'Not Started', elapsed: null };
      if (finished) {
        [hg, ag] = decisive(rnd);
        if (hg > ag) { win = h; lose = a; } else { win = a; lose = h; }
        status = { short: 'FT', long: 'Match Finished', elapsed: 90 };
      }
      out.push({
        id: fid++, utcDate: kickoff, timestamp: Math.floor(ts / 1000),
        venue: { name: pick(VENUES), city: null }, round: rd.round, rawRound: rd.round, group: null,
        status, finished, home: known ? koRef(h, hg) : TBD(), away: known ? koRef(a, ag) : TBD(),
      });
      winners.push(win);
      losers.push(lose);
    });
    if (rd.round === 'Semi-finals') semiLosers = losers;
    pairs = [];
    for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
  }
  const [h3, a3] = semiLosers.length === 2 ? semiLosers : [{ name: 'TBD' }, { name: 'TBD' }];
  const kk = new Date(Date.UTC(2026, 6, 18, 16, 0, 0)).toISOString();
  const ts3 = new Date(kk).getTime();
  const known3 = h3 && a3 && h3.name !== 'TBD' && a3.name !== 'TBD';
  const fin3 = known3 && ts3 + 105 * 60000 < nowMs;
  let hg3 = null;
  let ag3 = null;
  let st3 = { short: 'NS', long: 'Not Started', elapsed: null };
  if (fin3) {
    [hg3, ag3] = decisive(rnd);
    st3 = { short: 'FT', long: 'Match Finished', elapsed: 90 };
  }
  out.push({
    id: fid++, utcDate: kk, timestamp: Math.floor(ts3 / 1000),
    venue: { name: pick(VENUES), city: null }, round: '3rd Place Final', rawRound: '3rd Place Final', group: null,
    status: st3, finished: fin3, home: known3 ? koRef(h3, hg3) : TBD(), away: known3 ? koRef(a3, ag3) : TBD(),
  });
  return out;
}

if (STAGE === 'ko') {
  const winners = groups.map((g) => g.table[0]);
  const runners = groups.map((g) => g.table[1]);
  const thirds = [...groups.map((g) => g.table[2])]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor
    )
    .slice(0, 8);
  const qualTeams = [...winners, ...runners, ...thirds].map((r) => r.team);
  fixtures.push(...simKO(qualTeams, NOW));
} else {
  const KO = [
    { round: 'Round of 32', month: 5, days: [28, 29, 30], n: 16 },
    { round: 'Round of 16', month: 6, days: [4, 5, 6, 7], n: 8 },
    { round: 'Quarter-finals', month: 6, days: [9, 10, 11], n: 4 },
    { round: 'Semi-finals', month: 6, days: [14, 15], n: 2 },
    { round: '3rd Place Final', month: 6, days: [18], n: 1 },
    { round: 'Final', month: 6, days: [19], n: 1 },
  ];
  for (const { round, month, days, n } of KO) {
    for (let i = 0; i < n; i++) {
      const kickoff = new Date(Date.UTC(2026, month, days[i % days.length], i % 2 ? 19 : 16, 0, 0)).toISOString();
      fixtures.push({
        id: fid++, utcDate: kickoff, timestamp: Math.floor(new Date(kickoff).getTime() / 1000),
        venue: { name: pick(VENUES), city: null }, round, rawRound: round, group: null,
        status: { short: 'NS', long: 'Not Started', elapsed: null }, finished: false,
        home: TBD(), away: TBD(),
      });
    }
  }
}

// --- Golden Boot: a believable leaderboard of real players from QUALIFIED teams ---
const SCORERS = [
  ['Kylian Mbappé', 'France', 5, 1],
  ['Harry Kane', 'England', 4, 2],
  ['Erling Haaland', 'Norway', 4, 0],
  ['Vinícius Júnior', 'Brazil', 3, 3],
  ['Lautaro Martínez', 'Argentina', 3, 1],
  ['Mohamed Salah', 'Egypt', 3, 1],
  ['Cristiano Ronaldo', 'Portugal', 3, 0],
  ['Cody Gakpo', 'Netherlands', 2, 2],
  ['Florian Wirtz', 'Germany', 2, 3],
  ['Romelu Lukaku', 'Belgium', 2, 1],
  ['Christian Pulisic', 'United States', 2, 2],
  ['Son Heung-min', 'South Korea', 2, 1],
  ['Mohammed Kudus', 'Ghana', 2, 0],
  ['Julián Álvarez', 'Argentina', 2, 1],
  ['Dušan Vlahović', 'Switzerland', 1, 0],
];
function scorerEntry([name, teamName, goals, assists], i) {
  const t = TEAMS[teamName] ?? { code: null };
  return {
    player: { id: 900000 + i, name, photo: null },
    team: { id: hashId(t.code || teamName), name: teamName, code: t.code ?? null, logo: null },
    goals,
    assists,
    minutes: 180 + Math.floor(rnd() * 90),
    appearances: 2,
    penalties: name.includes('Ronaldo') || name.includes('Kane') ? 1 : 0,
  };
}
const topscorers = SCORERS.map(scorerEntry);
const topassists = [...SCORERS]
  .map((s, i) => scorerEntry([s[0], s[1], s[3], s[2]], i)) // swap goals/assists -> rank by assists
  .sort((a, b) => b.goals - a.goals)
  .slice(0, 12);

const now = new Date(NOW).toISOString();
await writeJSON(dataPath('fixtures.json'), {
  updatedAt: now,
  league: { id: 1, season: 2026 },
  fixtures,
});
await writeJSON(dataPath('standings.json'), { updatedAt: now, groups });
await writeJSON(dataPath('topscorers.json'), { updatedAt: now, players: topscorers });
await writeJSON(dataPath('topassists.json'), { updatedAt: now, players: topassists });

// --- per-match files for finished fixtures (statistics/events/lineups/players) ---
function squadFor(team) {
  const r = makeRng(hashId(`${team.code || team.name}sq`) + 11);
  const marquee = SCORERS.filter((s) => s[1] === team.name).map((s) => s[0]);
  const names = [...marquee];
  const used = new Set(names);
  while (names.length < 18) {
    const nm = `${pickR(INITIALS, r)}. ${pickR(SURNAMES, r)}`;
    if (!used.has(nm)) {
      used.add(nm);
      names.push(nm);
    }
  }
  const starters = new Array(11);
  for (let k = 0; k < 11; k++) {
    const slot = SLOT_PRIORITY[k];
    const fslot = FORMATION_433[slot];
    const name = names[k];
    starters[slot] = {
      id: hashId(team.code + name) % 1000000,
      name,
      number: slot === 0 ? 1 : slot + 1,
      pos: fslot.pos,
      grid: fslot.grid,
    };
  }
  const subPos = ['M', 'F', 'D', 'M', 'D', 'G', 'F'];
  const subs = names.slice(11).map((name, i) => ({
    id: hashId(team.code + name) % 1000000,
    name,
    number: 12 + i,
    pos: subPos[i] || 'M',
    grid: null,
  }));
  return { starters, subs };
}
function pickR(arr, r) {
  return arr[Math.floor(r() * arr.length)];
}

function teamPerf(squad, goals, r) {
  const starters = squad.starters;
  const attackers = starters.filter((p) => p.pos === 'F' || p.pos === 'M');
  const stat = new Map(
    starters.map((p) => [
      p.id,
      { goals: 0, assists: 0, shots: 0, sot: 0, yellow: 0, red: 0, minutes: 90, rating: 6.2 + r() * 1.2 },
    ])
  );
  const goalEvents = [];
  for (let g = 0; g < goals; g++) {
    // forwards twice as likely as midfielders
    const pool = attackers.flatMap((p) => (p.pos === 'F' ? [p, p] : [p]));
    const scorer = pickR(pool, r);
    const s = stat.get(scorer.id);
    s.goals += 1;
    s.shots += 1;
    s.sot += 1;
    s.rating = Math.min(9.6, s.rating + 0.6);
    let assist = null;
    if (r() < 0.6) {
      const others = attackers.filter((p) => p.id !== scorer.id);
      if (others.length) {
        assist = pickR(others, r);
        stat.get(assist.id).assists += 1;
        stat.get(assist.id).rating = Math.min(9.4, stat.get(assist.id).rating + 0.3);
      }
    }
    goalEvents.push({
      minute: 1 + Math.floor(r() * 89),
      scorer,
      assist,
      detail: r() < 0.12 ? 'Penalty' : 'Normal Goal',
    });
  }
  // spread non-goal shots
  for (const p of starters) {
    const s = stat.get(p.id);
    const base = p.pos === 'F' ? 2 : p.pos === 'M' ? 1 : 0;
    const extra = Math.floor(r() * (p.pos === 'F' ? 3 : p.pos === 'M' ? 2 : 1));
    s.shots += base + extra;
    const moreSot = Math.floor((base + extra) * (0.25 + r() * 0.3));
    s.sot = Math.min(s.shots, s.sot + moreSot);
  }
  const yc = Math.floor(r() * 3);
  for (let i = 0; i < yc; i++) stat.get(pickR(starters, r).id).yellow = 1;
  goalEvents.sort((a, b) => a.minute - b.minute);
  return { stat, goalEvents };
}

function buildMatch(f) {
  const r = makeRng(hashId(`m${f.id}`) + 3);
  const homeSquad = squadFor(f.home);
  const awaySquad = squadFor(f.away);
  const homePerf = teamPerf(homeSquad, f.home.goals ?? 0, r);
  const awayPerf = teamPerf(awaySquad, f.away.goals ?? 0, r);

  const sideStats = (perf, oppPerf, teamRef) => {
    let shots = 0;
    let sot = 0;
    let yellow = 0;
    for (const s of perf.stat.values()) {
      shots += s.shots;
      sot += s.sot;
      yellow += s.yellow;
    }
    const oppSot = [...oppPerf.stat.values()].reduce((a, s) => a + s.sot, 0);
    const oppGoals = teamRef === 'home' ? f.away.goals ?? 0 : f.home.goals ?? 0;
    const poss = teamRef === 'home' ? 42 + Math.floor(r() * 16) : null;
    const passes = 320 + Math.floor(r() * 360);
    const acc = Math.round(passes * (0.74 + r() * 0.16));
    const stats = {
      shotsOnTarget: sot,
      totalShots: shots,
      possession: poss, // filled for away below to sum 100
      corners: 2 + Math.floor(r() * 9),
      fouls: 6 + Math.floor(r() * 12),
      offsides: Math.floor(r() * 5),
      yellow,
      red: 0,
      saves: Math.max(0, oppSot - oppGoals),
      passes,
      passesAccurate: acc,
      passAccuracy: Math.round((acc / passes) * 100),
    };
    // xG present on ~half the matches (test the conditional-render path both ways)
    if (f.id % 2 === 0) {
      const goals = teamRef === 'home' ? f.home.goals ?? 0 : f.away.goals ?? 0;
      stats.xg = Math.round((sot * 0.28 + goals * 0.5 + r() * 0.4) * 10) / 10;
    }
    return stats;
  };

  const homeStats = sideStats(homePerf, awayPerf, 'home');
  const awayStats = sideStats(awayPerf, homePerf, 'away');
  awayStats.possession = 100 - homeStats.possession;

  const lineupOf = (teamRef, squad) => ({
    teamId: teamRef.id,
    name: teamRef.name,
    formation: '4-3-3',
    coach: `${teamRef.code || teamRef.name} Manager`,
    startXI: squad.starters,
    subs: squad.subs,
  });

  const playersOf = (teamRef, squad, perf) =>
    squad.starters.map((p) => {
      const s = perf.stat.get(p.id);
      return {
        id: p.id,
        name: p.name,
        teamId: teamRef.id,
        number: p.number,
        pos: p.pos,
        minutes: s.minutes,
        rating: Math.round(s.rating * 10) / 10,
        goals: s.goals,
        assists: s.assists,
        shots: s.shots,
        shotsOnTarget: s.sot,
        yellow: s.yellow,
        red: s.red,
      };
    });

  const goalEvent = (e, teamRef) => ({
    minute: e.minute,
    extra: null,
    teamId: teamRef.id,
    teamName: teamRef.name,
    player: e.scorer.name,
    playerId: e.scorer.id,
    assist: e.assist ? e.assist.name : null,
    assistId: e.assist ? e.assist.id : null,
    type: 'Goal',
    detail: e.detail,
  });

  const events = [
    ...homePerf.goalEvents.map((e) => goalEvent(e, f.home)),
    ...awayPerf.goalEvents.map((e) => goalEvent(e, f.away)),
  ].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  return {
    fixtureId: f.id,
    fetchedAt: now,
    teams: { home: f.home, away: f.away },
    statsByTeam: [
      { teamId: f.home.id, name: f.home.name, stats: homeStats },
      { teamId: f.away.id, name: f.away.name, stats: awayStats },
    ],
    events,
    lineups: [lineupOf(f.home, homeSquad), lineupOf(f.away, awaySquad)],
    players: [
      ...playersOf(f.home, homeSquad, homePerf),
      ...playersOf(f.away, awaySquad, awayPerf),
    ],
  };
}

// clear stale match files, then write one per finished fixture
try {
  for (const file of readdirSync(MATCHES)) {
    if (file.endsWith('.json')) unlinkSync(matchPath(file.replace('.json', '')));
  }
} catch {
  /* dir may not exist yet */
}
const finishedFixtures = fixtures.filter((f) => f.finished);
const matchIds = [];
for (const f of finishedFixtures) {
  await writeJSON(matchPath(f.id), buildMatch(f));
  matchIds.push(f.id);
}
await writeJSON(dataPath('manifest.json'), {
  fetched: matchIds,
  lastRun: now,
  rateRemaining: null,
});

const finished = fixtures.filter((f) => f.finished).length;
const live = fixtures.filter((f) => ['1H', '2H', 'HT'].includes(f.status.short)).length;
console.log(
  `✓ mock data written — ${fixtures.length} fixtures (${finished} FT, ${live} live), ${groups.length} groups, ${topscorers.length} scorers, ${matchIds.length} match files`
);
console.log('  Run `npm run build` to see the populated site. fetch.mjs overwrites this with live data.');
