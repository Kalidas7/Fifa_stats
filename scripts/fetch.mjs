#!/usr/bin/env node
// FootStats updater (Phase 1: the four daily list endpoints).
//
// Budget: this run makes exactly 4 calls — fixtures + standings + topscorers + topassists.
// Phase 2 adds the per-match loop (statistics/players/events/lineups) for newly-finished
// fixtures, each fetched ONCE (guarded by data/manifest.json). A delay between calls keeps
// us under the per-minute burst limit; every step logs remaining daily quota.
//
//   APISPORTS_KEY=xxxx npm run fetch
//
import { apiGet, hasKey, LEAGUE, SEASON, sleep, rateRemaining } from './lib/api.mjs';
import { writeJSON, readJSON, dataPath, matchPath, pruneMatches } from './lib/io.mjs';
import {
  normalizeFixtures,
  normalizeStandings,
  normalizeScorers,
  normalizeMatch,
} from './lib/normalize.mjs';

const DELAY = Number(process.env.FETCH_DELAY_MS || 1500);
const now = () => new Date().toISOString();
const remain = () => {
  const r = rateRemaining();
  return r == null ? '?' : r;
};

async function main() {
  if (!hasKey()) {
    console.error('✗ APISPORTS_KEY not set.');
    console.error('  Local: cp .env.example .env and paste your key.  CI: set the APISPORTS_KEY secret.');
    console.error('  No key handy? Preview the site with demo data:  npm run mock');
    process.exit(1);
  }

  console.log(`▶ FootStats fetch — league=${LEAGUE} season=${SEASON}`);

  // 1) All fixtures (one call returns all 104).
  const fixtures = normalizeFixtures(await apiGet('/fixtures', { league: LEAGUE, season: SEASON }));
  await writeJSON(dataPath('fixtures.json'), {
    updatedAt: now(),
    league: { id: LEAGUE, season: SEASON },
    fixtures,
  });
  const finished = fixtures.filter((f) => f.finished).length;
  console.log(`  ✓ fixtures: ${fixtures.length} total, ${finished} finished  (quota left: ${remain()})`);

  // Drop match files for fixtures no longer in this league/season (e.g. season switch).
  const fixtureIds = new Set(fixtures.map((f) => f.id));
  const pruned = await pruneMatches(fixtureIds);
  if (pruned.length) console.log(`  ⌫ pruned ${pruned.length} stale match file(s)`);
  await sleep(DELAY);

  // 2) Group tables (per-group standings).
  const groups = normalizeStandings(await apiGet('/standings', { league: LEAGUE, season: SEASON }));
  await writeJSON(dataPath('standings.json'), { updatedAt: now(), groups });
  console.log(`  ✓ standings: ${groups.length} groups  (quota left: ${remain()})`);
  await sleep(DELAY);

  // 3) Golden Boot.
  const topscorers = normalizeScorers(await apiGet('/players/topscorers', { league: LEAGUE, season: SEASON }));
  await writeJSON(dataPath('topscorers.json'), { updatedAt: now(), players: topscorers });
  console.log(`  ✓ topscorers: ${topscorers.length}  (quota left: ${remain()})`);
  await sleep(DELAY);

  // 4) Top assists.
  const topassists = normalizeScorers(await apiGet('/players/topassists', { league: LEAGUE, season: SEASON }));
  await writeJSON(dataPath('topassists.json'), { updatedAt: now(), players: topassists });
  console.log(`  ✓ topassists: ${topassists.length}  (quota left: ${remain()})`);

  // 5) Per-match data for newly-finished fixtures — fetched ONCE, then recorded in the
  //    manifest so the cron never re-spends quota on it. Capped per run to stay in budget.
  const manifest = (await readJSON(dataPath('manifest.json'))) ?? {
    fetched: [],
    lastRun: null,
    rateRemaining: null,
  };
  manifest.fetched = (manifest.fetched ?? []).filter((id) => fixtureIds.has(id));
  const done = new Set(manifest.fetched);
  // Most-recent-finished first, so knockouts/Final get detail pages before older group games
  // when backfilling a completed tournament within the daily quota.
  const newlyFinished = fixtures
    .filter((f) => f.finished && f.id != null && !done.has(f.id))
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  const cap = Number(process.env.MAX_MATCHES_PER_RUN || 20);
  const batch = newlyFinished.slice(0, cap);

  if (batch.length > 0) {
    console.log(`  ${newlyFinished.length} finished match(es) need data — fetching ${batch.length} (4 calls each):`);
  }
  for (const f of batch) {
    try {
      await sleep(DELAY);
      const statistics = await apiGet('/fixtures/statistics', { fixture: f.id });
      await sleep(DELAY);
      const events = await apiGet('/fixtures/events', { fixture: f.id });
      await sleep(DELAY);
      const lineups = await apiGet('/fixtures/lineups', { fixture: f.id });
      await sleep(DELAY);
      const playersResp = await apiGet('/fixtures/players', { fixture: f.id });

      const match = normalizeMatch(f, { statistics, events, lineups, players: playersResp });
      await writeJSON(matchPath(f.id), match);
      manifest.fetched.push(f.id);
      console.log(
        `    ✓ ${f.id}: ${f.home.name} ${f.home.goals ?? 0}-${f.away.goals ?? 0} ${f.away.name}  (quota left: ${remain()})`
      );
    } catch (err) {
      // Don't add to manifest on failure — it retries next run.
      console.error(`    ✗ ${f.id} failed: ${err?.message ?? err} — will retry next run.`);
    }
  }
  if (newlyFinished.length > batch.length) {
    console.log(`  ${newlyFinished.length - batch.length} match(es) deferred to next run (cap ${cap}).`);
  }

  manifest.lastRun = now();
  manifest.rateRemaining = rateRemaining();
  await writeJSON(dataPath('manifest.json'), manifest);

  console.log(`✓ fetch complete — daily quota remaining: ${remain()}`);
}

main().catch((err) => {
  console.error('✗ fetch failed:', err?.message ?? err);
  process.exit(1);
});
