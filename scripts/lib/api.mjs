// Thin API-Football v3 client. Reads the key from env (never hardcoded), retries on
// transient failures, respects the per-minute burst limit via a caller-side delay, and
// tracks the x-ratelimit-requests-remaining header so each run logs remaining quota.
const BASE = 'https://v3.football.api-sports.io';
// .trim() guards against a stray space/newline in the pasted secret (a common cause of
// "Missing application key" — the header value must be exactly the 32-char key).
const KEY = (process.env.APISPORTS_KEY || process.env.API_FOOTBALL_KEY || '').trim();

export const LEAGUE = Number(process.env.APISPORTS_LEAGUE || 1);
// Free tier covers seasons 2022–2024 only, so we use the real 2022 World Cup.
// Set APISPORTS_SEASON=2026 if you upgrade to a paid plan with current-season access.
export const SEASON = Number(process.env.APISPORTS_SEASON || 2022);

export function hasKey() {
  return Boolean(KEY);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastRemaining = null;
export function rateRemaining() {
  return lastRemaining;
}

/**
 * GET an endpoint with query params. Returns the parsed JSON envelope
 * ({ response, errors, ... }). Throws on HTTP/API errors after retries.
 */
export async function apiGet(endpoint, params = {}, { retries = 3, delayMs = 1500 } = {}) {
  if (!KEY) throw new Error('APISPORTS_KEY not set');
  const url = new URL(BASE + endpoint);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    let res;
    try {
      res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
    } catch (err) {
      if (attempt > retries) throw err;
      await sleep(delayMs * attempt);
      continue;
    }

    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining != null) lastRemaining = Number(remaining);

    if (res.status === 429) {
      if (attempt > retries) throw new Error(`${endpoint} -> 429 rate limited`);
      await sleep(delayMs * attempt * 2);
      continue;
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt <= retries) {
        await sleep(delayMs * attempt);
        continue;
      }
      throw new Error(`${endpoint} -> HTTP ${res.status}`);
    }

    const json = await res.json();
    // API-Football reports logical errors in `errors` (array OR object). Empty = ok.
    const errs = json?.errors;
    const hasErr =
      (Array.isArray(errs) && errs.length > 0) ||
      (errs && typeof errs === 'object' && !Array.isArray(errs) && Object.keys(errs).length > 0);
    if (hasErr) throw new Error(`${endpoint} -> API error: ${JSON.stringify(errs)}`);

    return json;
  }
}
