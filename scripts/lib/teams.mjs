// Node-side team lookup (mirrors src/lib/teams.ts for the build scripts). Resolves the
// FIFA code and group letter for any team name the API hands us, tolerating accents,
// punctuation and naming variants (USA, Korea Republic, Türkiye, Cabo Verde, ...).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const teams = JSON.parse(readFileSync(resolve(here, '..', '..', 'data', 'teams.json'), 'utf8'));

function norm(s) {
  return String(s)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const byNorm = new Map();
const byCode = new Map();
for (const [name, t] of Object.entries(teams)) {
  byNorm.set(norm(name), { name, ...t });
  if (t.code) byCode.set(t.code.toUpperCase(), { name, ...t });
}

const ALIASES = {
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

export function lookup(nameOrCode) {
  if (!nameOrCode) return null;
  const n = norm(nameOrCode);
  if (byNorm.has(n)) return byNorm.get(n);
  const aliased = ALIASES[n];
  if (aliased && byNorm.has(aliased)) return byNorm.get(aliased);
  const up = String(nameOrCode).toUpperCase();
  if (byCode.has(up)) return byCode.get(up);
  return null;
}

export function codeFor(name) {
  return lookup(name)?.code ?? null;
}

export function groupFor(name) {
  return lookup(name)?.group ?? null;
}

export const TEAMS = teams;
