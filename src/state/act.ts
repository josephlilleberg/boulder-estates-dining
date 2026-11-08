import type { AppData } from '../db/repo';
import type { Op } from './ops';
import { getStore } from './store';

/**
 * Fire-and-forget change from a click handler. Failures are already shown by the
 * save indicator (and the database is unchanged), so screens don't handle them.
 * Resolves true when the change was saved.
 */
export function act(label: string, ops: Op[] | ((data: AppData) => Op[])): Promise<boolean> {
  return getStore()
    .change(label, ops)
    .then(
      () => true,
      () => false,
    );
}
