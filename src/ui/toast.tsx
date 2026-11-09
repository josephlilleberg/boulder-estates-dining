import { useEffect, useSyncExternalStore } from 'react';
import { getStore } from '../state/store';

// A small pop-up after big changes (delete, archive, close a section) with an Undo button,
// so a mistake is one click away instead of a trip to the top bar.

interface ToastState {
  id: number;
  text: string;
}

let current: ToastState | null = null;
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showUndoToast(text: string) {
  current = { id: nextId++, text };
  emit();
}

export function dismissToast() {
  current = null;
  emit();
}

const SHOW_MS = 7000;

export function UndoToast() {
  const t = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
  useEffect(() => {
    if (!t) return;
    const timer = window.setTimeout(() => current?.id === t.id && dismissToast(), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  return (
    <div role="status" className="toast">
      <span>{t.text}</span>
      <button
        type="button"
        className="toast-undo"
        onClick={() => {
          dismissToast();
          void getStore().undoLast().catch(() => {});
        }}
      >
        Undo
      </button>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={dismissToast}>
        ×
      </button>
    </div>
  );
}
