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

/** The app's own backups folder, beside its data file: always writable, no permission needed. */
export function fallbackDir(dbPath: string): string {
  const cut = Math.max(dbPath.lastIndexOf('/'), dbPath.lastIndexOf('\\'));
  const sep = dbPath.includes('\\') ? '\\' : '/';
  return `${dbPath.slice(0, cut)}${sep}Backups`;
}

/** The last backup that couldn't go to the chosen folder (shown in Settings → Backups), or null. */
export type BackupProblem = { dir: string; error: string; savedTo: string | null };
let problem: BackupProblem | null = null;
const listeners = new Set<() => void>();
export const backupProblem = () => problem;
export function onBackupProblem(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function setProblem(p: BackupProblem | null) {
  if (p?.error === problem?.error && p?.dir === problem?.dir && p?.savedTo === problem?.savedTo) return;
  problem = p;
  listeners.forEach((l) => l());
}

/**
 * Today's backup in the chosen folder. If that folder can't be written (a Mac that hasn't
 * allowed the app into Documents, a missing drive…), it goes to the app's own folder instead
 * and the problem is kept for Settings to show. Throws only if neither works.
 */
export async function runDailyBackup(db: Db, settings: Record<string, string>): Promise<BackupResult | null> {
  const dir = await backupDir(db, settings);
  if (!dir) return null; // no file system (tests / plain browser)
  try {
    const r = await db.backup(dir, localDate(), BACKUP_KEEP);
    setProblem(null);
    return r;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const info = await db.info().catch(() => null);
    const spare = info ? fallbackDir(info.dbPath) : null;
    if (!spare || spare === dir) {
      setProblem({ dir, error, savedTo: null });
      throw e;
    }
    try {
      const r = await db.backup(spare, localDate(), BACKUP_KEEP);
      setProblem({ dir, error, savedTo: spare });
      return r;
    } catch {
      setProblem({ dir, error, savedTo: null });
      throw e;
    }
  }
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
 * today's backup exists (in the app's own folder if the chosen one is refused).
 */
export async function backupBeforeUpgrade(db: Db): Promise<void> {
  const hasMeta = await db.select(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'`);
  if (!hasMeta.length) return; // first run: nothing to protect yet
  const rows = await db.select<{ key: string; value: string }>(`SELECT key, value FROM meta`);
  // A backup that can't be written never keeps the app from opening: the problem shows in Settings.
  await runDailyBackup(db, Object.fromEntries(rows.map((r) => [r.key, r.value]))).catch((e) => console.error('Backup failed', e));
}
