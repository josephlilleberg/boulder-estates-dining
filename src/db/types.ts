// The one interface every storage backend implements. The app talks SQL through
// this; Tauri (real SQLite file) and sql.js (tests, browser dev) are swappable.

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface Stmt {
  sql: string;
  params?: SqlValue[];
}

export interface DbInfo {
  dbPath: string;
  defaultBackupDir: string;
}

export interface BackupResult {
  path: string;
  created: boolean;
  removed: string[];
}

export interface BackupFile {
  name: string;
  path: string;
  bytes: number;
}

export interface Db {
  select<T extends Row = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs every statement in one transaction: all commit or none do. */
  batch(stmts: Stmt[]): Promise<void>;
  /** Writes today's backup if missing and prunes to `keep`. Null when the backend has no files (tests, browser). */
  backup(dir: string, today: string, keep: number): Promise<BackupResult | null>;
  info(): Promise<DbInfo | null>;
  /** Restorable files in `dir`, newest first. Empty when the backend has no files. */
  listBackups(dir: string): Promise<BackupFile[]>;
  /**
   * Replace the whole database with `file`, first saving the current data as
   * before-restore-<stamp>.sqlite3 in `dir`. Returns that safety copy's path.
   */
  restore(file: string, dir: string, stamp: string, maxVersion: number): Promise<string>;
}
