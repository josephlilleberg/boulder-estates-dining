import type { Database, SqlJsStatic } from 'sql.js';
import type { Db, Row, SqlValue, Stmt } from './types';

// In-memory SQLite (WASM). Used by tests and when running in a plain browser
// without the Tauri shell. Same SQL dialect as the real database.
export function sqljsDb(SQL: SqlJsStatic, bytes?: Uint8Array, onChange?: (db: Database) => void): Db & { raw: Database } {
  const raw = new SQL.Database(bytes);
  raw.run('PRAGMA foreign_keys = ON');

  return {
    raw,
    async select<T extends Row>(sql: string, params: SqlValue[] = []) {
      const st = raw.prepare(sql);
      try {
        st.bind(params);
        const out: T[] = [];
        while (st.step()) out.push(st.getAsObject() as T);
        return out;
      } finally {
        st.free();
      }
    },
    async batch(stmts: Stmt[]) {
      raw.run('BEGIN');
      try {
        for (const s of stmts) raw.run(s.sql, s.params ?? []);
        raw.run('COMMIT');
      } catch (e) {
        raw.run('ROLLBACK');
        throw e;
      }
      onChange?.(raw);
    },
    backup: async () => null,
    info: async () => null,
    listBackups: async () => [],
    restore: async () => {
      throw new Error('Restoring needs the installed app');
    },
  };
}
