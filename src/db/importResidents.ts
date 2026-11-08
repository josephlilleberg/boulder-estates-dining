import { importLegacy, type LegacyData } from './seed/importLegacy';
import type { Db } from './types';

// Resident data never ships with the app: it's loaded once from a file the user
// picks (the old app's export, as converted by the mockup) into an empty database.

const CHAIRS = new Set(['Arms', 'No arms', 'Wheelchair']);
const isList = (x: unknown): x is unknown[] => Array.isArray(x);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Checks the file's shape and returns it typed, or throws a message for the user. */
export function parseResidentsFile(text: string): LegacyData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a residents file (it isn’t JSON).');
  }
  if (!isObj(raw) || !isList(raw.residents) || !isObj(raw.assign)) throw new Error('That file isn’t a residents file (no residents list).');
  if (raw.residents.length === 0) throw new Error('That file has no residents in it.');
  const ids = new Set<string>();
  raw.residents.forEach((r, i) => {
    const where = `Resident ${i + 1}`;
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.first !== 'string' || typeof r.last !== 'string') throw new Error(`${where} is missing a name or id.`);
    if (r.site !== 'BE') throw new Error(`${where} isn’t at Boulder Estates.`);
    if (!CHAIRS.has(String(r.chair))) throw new Error(`${where} has an unknown chair “${String(r.chair)}”.`);
    for (const k of ['notes', 'half', 'ro', 'hotw', 'meals'] as const) if (!isList(r[k])) throw new Error(`${where} is missing “${k}”.`);
    if (!isObj(r.drinks) || !isObj(r.extras)) throw new Error(`${where} is missing drinks or extras.`);
    if (ids.has(r.id)) throw new Error(`Two residents share the id ${r.id}.`);
    ids.add(r.id);
  });
  for (const [seat, id] of Object.entries(raw.assign)) {
    if (typeof id !== 'string' || !ids.has(id)) throw new Error(`Seat ${seat} points at a resident who isn’t in the file.`);
  }
  return raw as unknown as LegacyData;
}

export async function residentCount(db: Db): Promise<number> {
  const [row] = await db.select<{ n: number }>('SELECT COUNT(*) AS n FROM resident');
  return Number(row?.n ?? 0);
}

/** Loads residents, their meals, drinks, extras and seats in one transaction. Only into an empty app. */
export async function importResidents(db: Db, data: LegacyData): Promise<number> {
  if ((await residentCount(db)) > 0) throw new Error('Residents are already loaded. Importing only works in a new, empty app.');
  await db.batch(importLegacy(data));
  return data.residents.length;
}
