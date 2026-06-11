// Filesystem helpers + canonical paths. Scripts run from anywhere; paths resolve
// relative to this file so `npm run fetch` works regardless of cwd.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..'); // scripts/lib -> project root
export const DATA = resolve(ROOT, 'data');
export const MATCHES = resolve(DATA, 'matches');

export function dataPath(name) {
  return resolve(DATA, name);
}
export function matchPath(id) {
  return resolve(MATCHES, `${id}.json`);
}

export async function readJSON(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJSON(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

export async function listMatchIds() {
  try {
    const files = await readdir(MATCHES);
    return files.filter((f) => f.endsWith('.json')).map((f) => Number(f.replace('.json', '')));
  } catch {
    return [];
  }
}
