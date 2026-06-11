# FootStats ⚽ — FIFA World Cup 2026 stats site

A self-updating, **₹0 / free-tier** stats website for the 2026 FIFA World Cup
(11 Jun – 19 Jul 2026 · 48 teams · 12 groups A–L · 104 matches).

Fixtures, live-ish group tables & knockout bracket, the Golden Boot race, per-match
stats (hero stat = **shots on target**), and per-player tournament stats — with a
"FIFA-game-like" footbally UI, a signature scroll animation, and a tap-to-play
shots-on-target net animation.

> **Why it's free:** match stats are fetched **once, after full-time** (the numbers
> never change again), written to JSON committed in [`/data`](data/), and served as a
> fully static site. No live polling, no backend, no database. Peak API usage ≈ 28
> requests/day against a 100/day free cap. Animations are 100% client-side.

---

## Stack

| Concern | Choice |
| --- | --- |
| Static site | [Astro](https://astro.build) (`output: 'static'`) |
| Data fetcher | Node script (`.mjs`, built-in `fetch`) — [`scripts/fetch.mjs`](scripts/) |
| Scheduler | GitHub Actions cron (free) |
| Hosting | Any free tier — Cloudflare Pages / Vercel / Netlify / GitHub Pages |
| Data source | [API-Football v3](https://www.api-football.com) free tier (100 req/day) |
| Scroll choreography | GSAP + ScrollTrigger _(Phase 4)_ |
| Juggling character | Rive or Lottie, one rigged asset recolored per kit _(Phase 4)_ |
| Shots-on-target FX | HTML5 Canvas 2D _(Phase 5)_ |

Runtime: **Node 18+** (developed on Node 20 — see [`.nvmrc`](.nvmrc)).

---

## Quickstart (local)

```bash
npm install          # install deps
npm run dev          # dev server at http://localhost:4321
npm run build        # static build -> dist/
npm run preview      # preview the production build
npm run check        # astro type-check (0 errors expected)
```

The site builds and renders **without any API key** — it ships with placeholder data
and renders the verified group draw from [`data/teams.json`](data/teams.json). Real
fixtures/standings/stats appear once you run the data pipeline (below).

### Fetch real data locally

```bash
cp .env.example .env          # then paste your API-Football key into .env
npm run update                # fetch.mjs + aggregate.mjs  (Phase 1+)
```

---

## How the data pipeline works

```
GitHub Actions cron ──▶ scripts/fetch.mjs ──▶ writes /data/*.json + /data/matches/{id}.json
                                  │
                                  └──▶ scripts/aggregate.mjs ──▶ /data/players.json
                                                   │
                          commit /data ──▶ push ──▶ deploy workflow ──▶ live site
```

**Request budget (proof we stay free):**

- Daily refresh: `fixtures` + `standings` + `topscorers` + `topassists` = **4 calls/day**.
- Each **newly finished** match: `statistics` + `players` + `events` + `lineups` =
  **4 calls, fetched once ever** (the fixture id is recorded in
  [`data/manifest.json`](data/manifest.json) so the cron never re-spends quota on it).
- Busiest group-stage day ≈ 6 matches → 24 + 4 = **~28 calls**, far under 100.

The fetcher only ever pulls fixtures whose status is finished (`FT`/`AET`/`PEN`) and
not already in the manifest, with a delay between calls, logging the
`x-ratelimit-requests-remaining` header each run.

---

## Deployment

The repo includes a **GitHub Pages** workflow at
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It auto-detects whether
you're on a user/org root site or a project sub-path and sets Astro's `base` accordingly
(links use `import.meta.env.BASE_URL`, so they work either way).

**Enable GitHub Pages:** repo → Settings → Pages → Source = **GitHub Actions**.

**Prefer another host?** All produce a plain static build — point them at:

| Host | Build command | Output dir |
| --- | --- | --- |
| Cloudflare Pages | `npm run build` | `dist` |
| Vercel | `npm run build` | `dist` |
| Netlify | `npm run build` | `dist` |

(You can delete `deploy.yml` if you're not using GitHub Pages.)

---

## Human setup checklist

These steps need accounts/secrets and can't be scripted for you:

1. **API key** — create a free account at
   [dashboard.api-football.com](https://dashboard.api-football.com), copy the key.
2. **Verify coverage (once)** — confirm the league id/season before the cron goes live:
   ```bash
   curl -s "https://v3.football.api-sports.io/leagues?id=1&season=2026" \
     -H "x-apisports-key: $APISPORTS_KEY" | less
   ```
   Confirm `statistics_fixtures`, `statistics_players`, `standings`, `top_scorers` are `true`.
3. **GitHub repo + secret** — create the repo, push this code, add the key as an Actions
   secret named **`APISPORTS_KEY`** (Settings → Secrets and variables → Actions).
4. **Connect the host** — enable GitHub Pages (above) or connect Cloudflare/Vercel/Netlify.
5. **Juggling character (Phase 4)** — generate the player+ball art once with AI, then rig
   the loop in Rive/Lottie with a swappable jersey-color layer (one asset, 48 kits).

---

## Repo structure

```
/data                      committed JSON (refreshed by the cron)
  fixtures.json            all 104 fixtures (normalized)
  standings.json           12 group tables
  topscorers.json          Golden Boot
  topassists.json
  players.json             COMPUTED per-player tournament aggregates
  manifest.json            fixture ids already fetched (quota guard)
  teams.json               name -> { primary, secondary, code, group }  (hand-maintained)
  /matches/{id}.json       per-match stats/events/lineups (written once, post full-time)
/scripts
  fetch.mjs                the updater                        (Phase 1/2)
  aggregate.mjs            builds players.json from /matches  (Phase 3)
/src                       Astro site (layouts, components, pages, lib)
.github/workflows/
  deploy.yml               build + deploy to GitHub Pages
  update.yml               data refresh cron                  (Phase 1)
```

---

## Build status — all phases complete ✅

- [x] **Phase 0 — Scaffold.** Astro project, structure, verified `teams.json`, themed shell, deploy workflow.
- [x] **Phase 1 — Data pipeline + Home.** `fetch.mjs`, cron, fixtures (local time) + 12 group tables + Golden Boot.
- [x] **Phase 2 — Match pages.** Hero shots-on-target, comparison bars (conditional xG), goals timeline, formation pitches, standout.
- [x] **Phase 3 — Player profiles.** `aggregate.mjs` → `players.json`, profile pages with match logs + cross-links.
- [x] **Phase 4 — Scroll animation.** GSAP-pinned recolorable jugglers; ball passes behind content at ~50% scroll.
- [x] **Phase 5 — Shots-on-target net animation.** Tap-to-play 2D canvas; goals labelled from the events timeline.
- [x] **Phase 6 — Bracket + polish.** Group tables ⇄ knockout bracket (by `round`); xG shown where present. _(Three.js 3D shot upgrade intentionally left as a future option — 2D is the spec'd v1.)_

### Seeing it with data (no API key needed)

```bash
npm run mock              # believable mid-group-stage demo, then:  npm run build
MOCK_STAGE=ko npm run mock  # a late-tournament state with a populated knockout bracket
```

The committed `/data` ships as empty placeholders (the site renders graceful empty-states +
the real group draw). `npm run mock` or a real `npm run fetch` populates it; the cron commits
real data during the tournament.

### Remaining human steps (can't be scripted)

API key → `APISPORTS_KEY` secret · enable the host · (optional) swap the placeholder SVG
juggler in `src/components/ScrollJugglers.astro` for the rigged **Rive/Lottie** asset (§8).

---

*Cost target: ₹0/month. The only "cost" is that the GitHub Actions scheduler can run a
little late under load — fine for "update after the match," which is exactly the design.*
