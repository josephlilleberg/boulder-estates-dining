// The test app's Stress test button (npm run test-app only), cycling Off → 2 drinks → 2 drinks + RO → Full:
// 'drinks' keeps the real seating but gives every resident two drinks ('ro': and RO water); 'Full' puts a worst-case
// resident at every seat. Remembered between runs; never in the real app.
export type StressMode = 'off' | 'drinks' | 'ro' | 'full';
export const STRESS_MODES: StressMode[] = ['off', 'drinks', 'ro', 'full'];
const KEY = 'be-stress-test';
const listeners = new Set<() => void>();

export function stressMode(): StressMode {
  if (!import.meta.env.DEV) return 'off';
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'drinks' || v === 'ro' || v === 'full') return v;
    if (v === '1' || new URLSearchParams(window.location.search).has('stress')) return 'full';
    return 'off';
  } catch {
    return 'off';
  }
}

export function setStress(mode: StressMode): void {
  try {
    if (mode === 'off') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    /* this run only */
  }
  listeners.forEach((l) => l());
}

export function onStress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
