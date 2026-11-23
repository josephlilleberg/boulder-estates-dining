// The test app's Stress test switch (npm run test-app only): every seat on every sheet gets a
// worst-case resident, to see how crowded sheets hold up. Remembered between runs; never in the real app.
const KEY = 'be-stress-test';
const listeners = new Set<() => void>();

export function stressOn(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(KEY) === '1' || new URLSearchParams(window.location.search).has('stress');
  } catch {
    return false;
  }
}

export function setStress(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* this run only */
  }
  listeners.forEach((l) => l());
}

export function onStress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
