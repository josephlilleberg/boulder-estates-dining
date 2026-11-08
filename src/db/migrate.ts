import { MIGRATIONS, SCHEMA_VERSION, ddlStmts } from './schema';
import { SEED_SITE_IDS, catalogStmts, extraOptionStmts } from './seed/catalog';
import { insert, upsert } from './sql';
import type { Db, Stmt } from './types';

/** Data that comes with a schema upgrade (runs after that version's DDL). */
async function migrationData(db: Db, version: number, freshSiteIds?: string[]): Promise<Stmt[]> {
  if (version === 2) {
    const ids = freshSiteIds ?? (await db.select<{ id: string }>(`SELECT id FROM site ORDER BY sort`)).map((r) => r.id);
    return extraOptionStmts(ids);
  }
  return [];
}

async function upgrades(db: Db, from: number, freshSiteIds?: string[]): Promise<Stmt[]> {
  const out: Stmt[] = [];
  for (let v = from + 1; v <= SCHEMA_VERSION; v++) {
    out.push(...(MIGRATIONS[v] ?? []).map((sql) => ({ sql })), ...(await migrationData(db, v, freshSiteIds)));
  }
  return out;
}

/**
 * Creates the database on first run (catalog, rooms and tables; no residents: those are
 * imported from a file, see importResidents), or upgrades an older one (including
 * a restored backup), each in one transaction: it all applies or none of it does.
 */
export async function migrate(db: Db): Promise<{ seeded: boolean; upgradedFrom?: number }> {
  const hasMeta = await db.select(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`);
  if (hasMeta.length) {
    const [row] = await db.select<{ value: string }>(`SELECT value FROM meta WHERE key = 'schema_version'`);
    const v = Number(row?.value);
    if (!Number.isInteger(v) || v < 1) throw new Error('This file is not a dining app database.');
    if (v > SCHEMA_VERSION) throw new Error(`Database is from a newer version of the app (schema ${v}).`);
    if (v === SCHEMA_VERSION) return { seeded: false };
    await db.batch([...(await upgrades(db, v)), upsert('meta', { key: 'schema_version', value: String(SCHEMA_VERSION) })]);
    return { seeded: false, upgradedFrom: v };
  }

  await db.batch([
    ...ddlStmts(),
    ...catalogStmts(),
    ...(await upgrades(db, 1, SEED_SITE_IDS)),
    insert('meta', { key: 'schema_version', value: String(SCHEMA_VERSION) }),
    insert('meta', { key: 'seeded_at', value: new Date().toISOString() }),
  ]);
  return { seeded: true };
}
