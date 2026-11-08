import { invoke } from '@tauri-apps/api/core';
import type { BackupFile, BackupResult, Db, DbInfo, Row, SqlValue, Stmt } from './types';

// Backed by src-tauri/src/db.rs: a single rusqlite connection to %APPDATA%\…\dining.sqlite3.
export const tauriDb: Db = {
  select: <T extends Row>(sql: string, params: SqlValue[] = []) => invoke<T[]>('db_select', { sql, params }),
  batch: (stmts: Stmt[]) => invoke<void>('db_batch', { stmts: stmts.map((s) => ({ sql: s.sql, params: s.params ?? [] })) }),
  backup: (dir: string, today: string, keep: number) => invoke<BackupResult>('db_backup', { dir, today, keep }),
  info: () => invoke<DbInfo>('db_info'),
  listBackups: (dir: string) => invoke<BackupFile[]>('db_list_backups', { dir }),
  restore: (file: string, dir: string, stamp: string, maxVersion: number) => invoke<string>('db_restore', { file, dir, stamp, maxVersion }),
};

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
