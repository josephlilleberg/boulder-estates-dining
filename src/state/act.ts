import type { AppData } from '../db/repo';
import type { Op } from './ops';
import { showUndoToast } from '../ui/toast';
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

/** For big changes (delete, archive, close a section): on success, a pop-up offers Undo. */
export async function actUndoable(label: string, ops: Op[] | ((data: AppData) => Op[]), message: string): Promise<boolean> {
  const ok = await act(label, ops);
  if (ok) showUndoToast(message);
  return ok;
}
