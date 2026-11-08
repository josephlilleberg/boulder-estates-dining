import { PRIMARY_KEYS, type TableName } from './schema';
import type { Row, Stmt } from './types';

// Statement builders. Table and column names come from our own code, never from
// user input; values always go through parameters.

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`bad SQL identifier: ${name}`);
  return name;
}

export function insert(table: TableName, row: Row): Stmt {
  const cols = Object.keys(row).map(ident);
  return {
    sql: `INSERT INTO ${ident(table)} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    params: cols.map((c) => row[c] ?? null),
  };
}

/** Insert, or overwrite every given column if the primary key exists. Never deletes (so FKs hold). */
export function upsert(table: TableName, row: Row): Stmt {
  const pk: readonly string[] = PRIMARY_KEYS[table];
  const cols = Object.keys(row).map(ident);
  const rest = cols.filter((c) => !pk.includes(c));
  const onConflict = rest.length
    ? `DO UPDATE SET ${rest.map((c) => `${c} = excluded.${c}`).join(', ')}`
    : 'DO NOTHING';
  return {
    sql: `INSERT INTO ${ident(table)} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (${pk.join(', ')}) ${onConflict}`,
    params: cols.map((c) => row[c] ?? null),
  };
}

export function update(table: TableName, key: Row, set: Row): Stmt {
  const cols = Object.keys(set).map(ident);
  const where = whereKey(table, key);
  return {
    sql: `UPDATE ${ident(table)} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${where.sql}`,
    params: [...cols.map((c) => set[c] ?? null), ...where.params],
  };
}

export function remove(table: TableName, key: Row): Stmt {
  const where = whereKey(table, key);
  return { sql: `DELETE FROM ${ident(table)} WHERE ${where.sql}`, params: where.params };
}

export function selectByKey(table: TableName, key: Row): Stmt {
  const where = whereKey(table, key);
  return { sql: `SELECT * FROM ${ident(table)} WHERE ${where.sql}`, params: where.params };
}

export function keyOf(table: TableName, row: Row): Row {
  const out: Row = {};
  for (const c of PRIMARY_KEYS[table]) {
    const v = row[c];
    if (v === undefined || v === null) throw new Error(`${table}: missing key column ${c}`);
    out[c] = v;
  }
  return out;
}

function whereKey(table: TableName, key: Row) {
  const k = keyOf(table, key);
  const cols = Object.keys(k);
  return { sql: cols.map((c) => `${ident(c)} = ?`).join(' AND '), params: cols.map((c) => k[c]!) };
}
