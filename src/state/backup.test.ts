import { describe, expect, it } from 'vitest';
import type { Db } from '../db/types';
import { backupBeforeUpgrade, backupProblem, fallbackDir, runDailyBackup } from './backup';

// A database whose backups go wherever `refuse` allows: the chosen folder can be refused
// (a Mac that hasn't let the app into Documents), the app's own folder can't.
const fakeDb = (refuse: (dir: string) => boolean) => {
  const written: string[] = [];
  const db = {
    select: async (sql: string) => (sql.includes('sqlite_master') ? [{ 1: 1 }] : [{ key: 'schema_version', value: '9' }]),
    info: async () => ({ dbPath: '/Users/x/Library/Application Support/app/dining.sqlite3', defaultBackupDir: '/Users/x/Documents/Boulder Estates Backups' }),
    backup: async (dir: string) => {
      if (refuse(dir)) throw 'Operation not permitted (os error 1)';
      written.push(dir);
      return { path: `${dir}/dining.sqlite3`, created: true, removed: [] };
    },
  } as unknown as Db;
  return { db, written };
};

describe('daily backup', () => {
  it('the app’s own folder sits beside its data file, on either system', () => {
    expect(fallbackDir('/a/b/dining.sqlite3')).toBe('/a/b/Backups');
    expect(fallbackDir('C:\\Users\\x\\AppData\\Roaming\\app\\dining.sqlite3')).toBe('C:\\Users\\x\\AppData\\Roaming\\app\\Backups');
  });

  it('a refused folder never stops the app opening: the backup goes to the app’s own folder, and Settings is told', async () => {
    const { db, written } = fakeDb((d) => d.includes('Documents'));
    await expect(backupBeforeUpgrade(db)).resolves.toBeUndefined();
    expect(written).toEqual(['/Users/x/Library/Application Support/app/Backups']);
    expect(backupProblem()).toEqual({ dir: '/Users/x/Documents/Boulder Estates Backups', error: 'Operation not permitted (os error 1)', savedTo: '/Users/x/Library/Application Support/app/Backups' });
  });

  it('opens even when no backup can be written anywhere', async () => {
    const { db } = fakeDb(() => true);
    await expect(backupBeforeUpgrade(db)).resolves.toBeUndefined();
    expect(backupProblem()?.savedTo).toBeNull();
  });

  it('once the folder works again, the warning clears', async () => {
    const { db, written } = fakeDb(() => false);
    await runDailyBackup(db, {});
    expect(written).toEqual(['/Users/x/Documents/Boulder Estates Backups']);
    expect(backupProblem()).toBeNull();
  });
});
