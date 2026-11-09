import { useSyncExternalStore } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { isTauri } from '../db/tauriDb';

// App updates come from the latest GitHub release (latest.json, signed with the
// project's updater key). Only the installed app can update; the browser dev build can't.

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; percent: number | null }
  | { kind: 'error'; message: string };

let state: UpdateState = { kind: 'idle' };
let pending: Update | null = null;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

export const updatesSupported = isTauri;
export const getUpdateState = () => state;

/** Calls `fn` now and on every change; returns an unsubscribe. */
export function onUpdateState(fn: (s: UpdateState) => void): () => void {
  const l = () => fn(state);
  listeners.add(l);
  l();
  return () => listeners.delete(l);
}

/** How often a running app looks for a new version (it may stay open all day). */
export const RECHECK_MS = 4 * 60 * 60 * 1000;

/** Checks at launch, then every few hours, quietly. */
export function watchForUpdates(): void {
  if (!isTauri()) return;
  void checkForUpdate({ quiet: true });
  window.setInterval(() => {
    if (state.kind !== 'available' && state.kind !== 'installing') void checkForUpdate({ quiet: true });
  }, RECHECK_MS);
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `quiet`: the launch check, which stays silent if it fails (offline, GitHub down). */
export async function checkForUpdate({ quiet = false } = {}): Promise<void> {
  if (!isTauri() || state.kind === 'checking' || state.kind === 'installing') return;
  set({ kind: 'checking' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    pending = await check();
    set(pending ? { kind: 'available', version: pending.version } : { kind: 'current' });
  } catch (e) {
    set(quiet ? { kind: 'idle' } : { kind: 'error', message: `Couldn’t check for updates: ${message(e)}` });
  }
}

/** Downloads, installs and restarts. Data and backups live outside the app, so they're kept. */
export async function installUpdate(): Promise<void> {
  if (!pending || state.kind === 'installing') return;
  let total = 0;
  let done = 0;
  set({ kind: 'installing', percent: null });
  try {
    await pending.downloadAndInstall((ev) => {
      if (ev.event === 'Started') total = ev.data.contentLength ?? 0;
      if (ev.event === 'Progress') {
        done += ev.data.chunkLength;
        if (total) set({ kind: 'installing', percent: Math.min(100, Math.round((done / total) * 100)) });
      }
    });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    set({ kind: 'error', message: `The update didn’t install: ${message(e)}` });
  }
}

export async function appVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}
