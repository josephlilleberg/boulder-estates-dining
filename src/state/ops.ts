import type { TableName } from '../db/schema';
import { keyOf, remove, selectByKey, update, upsert } from '../db/sql';
import type { Db, Row, Stmt } from '../db/types';

// Every change is a list of row operations. Before writing, we read each row's
// current value and build the exact inverse, so Undo is generic: no hand-written
// "undo" code per feature, and nothing a feature forgets to reverse.

export type Op =
  | { kind: 'put'; table: TableName; row: Row } // insert, or overwrite these columns
  | { kind: 'patch'; table: TableName; key: Row; set: Row }
  | { kind: 'del'; table: TableName; key: Row };

export const put = (table: TableName, row: Row): Op => ({ kind: 'put', table, row });
export const patch = (table: TableName, key: Row, set: Row): Op => ({ kind: 'patch', table, key, set });
export const del = (table: TableName, key: Row): Op => ({ kind: 'del', table, key });

export function toStmt(op: Op): Stmt {
  switch (op.kind) {
    case 'put':
      return upsert(op.table, op.row);
    case 'patch':
      return update(op.table, op.key, op.set);
    case 'del':
      return remove(op.table, op.key);
  }
}

const keyId = (table: TableName, key: Row) => `${table}:${JSON.stringify(keyOf(table, key))}`;

/**
 * Returns the ops that undo `ops`, computed against the database as it is now.
 * Rows touched more than once in the same change (a seat swap) are tracked
 * through an overlay so each inverse sees the state just before its own op.
 */
export async function invert(db: Db, ops: Op[]): Promise<Op[]> {
  const overlay = new Map<string, Row | null>();
  const before = async (table: TableName, key: Row): Promise<Row | null> => {
    const id = keyId(table, key);
    if (overlay.has(id)) return overlay.get(id)!;
    const s = selectByKey(table, key);
    const [row] = await db.select(s.sql, s.params);
    return row ?? null;
  };

  const inverse: Op[] = [];
  for (const op of ops) {
    const key = op.kind === 'put' ? keyOf(op.table, op.row) : op.key;
    const prev = await before(op.table, key);
    const id = keyId(op.table, key);
    switch (op.kind) {
      case 'put':
        inverse.push(prev ? put(op.table, pick(prev, Object.keys(op.row))) : del(op.table, key));
        overlay.set(id, { ...(prev ?? {}), ...op.row });
        break;
      case 'patch':
        if (prev) {
          inverse.push(patch(op.table, key, pick(prev, Object.keys(op.set))));
          overlay.set(id, { ...prev, ...op.set });
        }
        break;
      case 'del':
        if (prev) inverse.push(put(op.table, prev));
        overlay.set(id, null);
        break;
    }
  }
  return inverse.reverse();
}

function pick(row: Row, cols: string[]): Row {
  const out: Row = {};
  for (const c of cols) out[c] = row[c] ?? null;
  return out;
}
