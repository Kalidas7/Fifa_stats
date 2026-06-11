#!/usr/bin/env node
// Builds data/players.json — per-player tournament aggregates summed across every
// data/matches/*.json. This is the "playerwise stats" feature powering /player/{id}.
// Runs at the end of every fetch (and `npm run aggregate` standalone).
import { readJSON, writeJSON, dataPath, matchPath, listMatchIds } from './lib/io.mjs';

const now = () => new Date().toISOString();

async function main() {
  const fixturesFile = (await readJSON(dataPath('fixtures.json'))) ?? { fixtures: [] };
  const fxById = new Map((fixturesFile.fixtures ?? []).map((f) => [f.id, f]));

  // Photo + canonical name from topscorers, when available.
  const tsFile = (await readJSON(dataPath('topscorers.json'))) ?? { players: [] };
  const photoById = new Map();
  for (const s of tsFile.players ?? []) {
    if (s.player?.id && s.player.photo) photoById.set(s.player.id, s.player.photo);
  }

  const ids = await listMatchIds();
  const agg = new Map();

  for (const id of ids) {
    const m = await readJSON(matchPath(id));
    if (!m) continue;
    const fx = fxById.get(m.fixtureId);
    const homeRef = m.teams?.home ?? null;
    const awayRef = m.teams?.away ?? null;

    for (const p of m.players ?? []) {
      if (p.id == null) continue;

      const isHome = p.teamId === homeRef?.id;
      const teamRef = isHome ? homeRef : awayRef;
      const oppRef = isHome ? awayRef : homeRef;

      let a = agg.get(p.id);
      if (!a) {
        a = {
          id: p.id,
          name: p.name,
          photo: photoById.get(p.id) ?? null,
          team: teamRef
            ? { id: teamRef.id ?? null, name: teamRef.name, code: teamRef.code ?? null, logo: teamRef.logo ?? null }
            : { id: p.teamId ?? null, name: '', code: null, logo: null },
          appearances: 0,
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          minutes: 0,
          yellow: 0,
          red: 0,
          _ratingSum: 0,
          _ratingCount: 0,
          log: [],
        };
        agg.set(p.id, a);
      }

      a.appearances += 1;
      a.goals += p.goals ?? 0;
      a.assists += p.assists ?? 0;
      a.shots += p.shots ?? 0;
      a.shotsOnTarget += p.shotsOnTarget ?? 0;
      a.minutes += p.minutes ?? 0;
      a.yellow += p.yellow ?? 0;
      a.red += p.red ?? 0;
      if (p.rating != null) {
        a._ratingSum += p.rating;
        a._ratingCount += 1;
      }
      a.log.push({
        fixtureId: m.fixtureId,
        date: fx?.utcDate ?? m.fetchedAt ?? null,
        opponent: oppRef?.name ?? null,
        opponentCode: oppRef?.code ?? null,
        minutes: p.minutes ?? null,
        goals: p.goals ?? 0,
        assists: p.assists ?? 0,
        shots: p.shots ?? 0,
        shotsOnTarget: p.shotsOnTarget ?? 0,
        rating: p.rating ?? null,
        yellow: p.yellow ?? 0,
        red: p.red ?? 0,
      });
    }
  }

  const players = [...agg.values()].map((a) => {
    const { _ratingSum, _ratingCount, ...rest } = a;
    rest.avgRating = _ratingCount ? Math.round((_ratingSum / _ratingCount) * 10) / 10 : null;
    rest.log.sort((x, y) => String(x.date).localeCompare(String(y.date)));
    return rest;
  });

  // Sort by goals, then assists, then rating — handy default order.
  players.sort(
    (x, y) =>
      y.goals - x.goals ||
      y.assists - x.assists ||
      (y.avgRating ?? 0) - (x.avgRating ?? 0) ||
      x.name.localeCompare(y.name)
  );

  await writeJSON(dataPath('players.json'), { updatedAt: now(), players });
  console.log(`✓ aggregate: ${players.length} players across ${ids.length} matches -> data/players.json`);
}

main().catch((err) => {
  console.error('✗ aggregate failed:', err?.message ?? err);
  process.exit(1);
});
