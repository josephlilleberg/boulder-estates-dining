import { useSyncExternalStore } from 'react';
import { migrate } from '../db/migrate';
import { loadAll, type AppData } from '../db/repo';
import type { Db } from '../db/types';
import { invert, toStmt, type Op } from './ops';

export const UNDO_LIMIT = 100; // brief asks for at least 50

export type SaveStatus = 'saved' | 'saving' | 'error';

interface UndoStep {
  label: string;
  inverse: Op[];
}

export interface StoreState {
  data: AppData;
  status: SaveStatus;
  error: string | null;
  undoLabel: string | null;
}

/**
 * The single place changes happen. Each change is written to SQLite immediately
 * (one transaction with its undo info computed first), then the in-memory copy is
 * reloaded from disk. Changes run one at a time in order, so rapid clicks can't race.
 */
export class Store {
  private state: StoreState;
  private undo: UndoStep[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly db: Db,
    data: AppData,
  ) {
    this.state = { data, status: 'saved', error: null, undoLabel: null };
  }

  static async open(db: Db): Promise<Store> {
    return new Store(db, await loadAll(db));
  }

  get = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Apply a change. `ops` may be computed from current data (it runs after earlier queued changes). */
  change(label: string, ops: Op[] | ((data: AppData) => Op[])): Promise<void> {
    return this.enqueue(async () => {
      const list = typeof ops === 'function' ? ops(this.state.data) : ops;
      if (!list.length) return;
      const inverse = await invert(this.db, list);
      await this.db.batch(list.map(toStmt));
      this.undo.push({ label, inverse });
      if (this.undo.length > UNDO_LIMIT) this.undo.shift();
    });
  }

  undoLast(): Promise<void> {
    return this.enqueue(async () => {
      const step = this.undo.pop();
      if (!step) return;
      try {
        await this.db.batch(step.inverse.map(toStmt));
      } catch (e) {
        this.undo.push(step); // keep it so nothing is lost; the error banner explains
        throw e;
      }
    });
  }

  /** The database the store writes to (Settings reads backup info through it). */
  get database(): Db {
    return this.db;
  }

  /**
   * Swap in a whole database (restoring a backup). Older backups are upgraded,
   * and the undo history is dropped: it describes data that's no longer there.
   */
  replaceAll(work: (db: Db) => Promise<void>): Promise<void> {
    return this.enqueue(async () => {
      await work(this.db);
      await migrate(this.db);
      this.undo = [];
    });
  }

  get canUndo() {
    return this.undo.length > 0;
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = async () => {
      this.set({ status: 'saving' });
      try {
        await work();
        this.set({ data: await loadAll(this.db), status: 'saved', error: null });
      } catch (e) {
        // The transaction rolled back, so disk is unchanged; reload to be certain the UI matches it.
        const data = await loadAll(this.db).catch(() => this.state.data);
        this.set({ data, status: 'error', error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private set(patch: Partial<StoreState>) {
    const top = this.undo[this.undo.length - 1];
    this.state = { ...this.state, ...patch, undoLabel: top?.label ?? null };
    this.listeners.forEach((l) => l());
  }
}

// ---- React binding ---------------------------------------------------------

let current: Store | null = null;
export const setStore = (s: Store) => {
  current = s;
};
export function getStore(): Store {
  if (!current) throw new Error('store not initialised');
  return current;
}

export function useStore<T>(select: (s: StoreState) => T): T {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
