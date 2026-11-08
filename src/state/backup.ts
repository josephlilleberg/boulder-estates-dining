import type { BackupResult, Db } from '../db/types';

export const BACKUP_KEEP = 30;

/** Local calendar date as YYYY-MM-DD (the manager's "today", not UTC). */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Backup folder: the one chosen in Settings (meta.backup_dir), else Documents\Boulder Estates Backups. */
export async function backupDir(db: Db, settings: Record<string, string>): Promise<string | null> {
  return settings.backup_dir ?? (await db.info())?.defaultBackupDir ?? null;
}

export async function runDailyBackup(db: Db, settings: Record<string, string>): Promise<BackupResult | null> {
  const dir = await backupDir(db, settings);
  if (!dir) return null; // no file system (tests / plain browser)
  return db.backup(dir, localDate(), BACKUP_KEEP);
}

/**
 * Back up on launch, then check hourly so an app left open overnight still
 * gets a backup for the new day. Failures are logged, never block the UI.
 */
export function scheduleBackups(db: Db, getSettings: () => Record<string, string>, onError: (e: unknown) => void): () => void {
  const tick = () => runDailyBackup(db, getSettings()).catch(onError);
  void tick();
  const id = setInterval(tick, 60 * 60 * 1000);
  return () => clearInterval(id);
}

/**
 * Before the app opens (and possibly upgrades) an existing database, make sure
 * today's backup exists, so an upgrade never runs on data that isn't backed up.
 */
export async function backupBeforeUpgrade(db: Db): Promise<void> {
  const hasMeta = await db.select(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`);
  if (!hasMeta.length) return; // first run: nothing to protect yet
  const rows = await db.select<{ key: string; value: string }>(`SELECT key, value FROM meta`);
  await runDailyBackup(db, Object.fromEntries(rows.map((r) => [r.key, r.value])));
}
