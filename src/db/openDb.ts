import { isTauri, tauriDb } from './tauriDb';
import type { Db } from './types';

const DEV_KEY = 'be-dining-dev-db';

/**
 * The real app always runs in Tauri (SQLite file in AppData). In a plain browser
 * (`npm run dev` without the shell) we fall back to an in-browser SQLite kept in
 * localStorage, so UI work doesn't need the desktop build. Never used in release.
 */
export async function openDb(): Promise<Db> {
  if (isTauri()) return tauriDb;

  const [{ default: initSqlJs }, { default: wasmUrl }, { sqljsDb }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('./sqljsDb'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let saved: Uint8Array | undefined;
  try {
    const b64 = localStorage.getItem(DEV_KEY);
    if (b64) saved = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    /* storage unavailable: start fresh */
  }
  return sqljsDb(SQL, saved, (raw) => {
    try {
      const bytes = raw.export();
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      localStorage.setItem(DEV_KEY, btoa(s));
    } catch {
      /* best effort in dev */
    }
  });
}

export const resetDevDb = () => localStorage.removeItem(DEV_KEY);
