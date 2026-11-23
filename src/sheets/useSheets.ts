import { useMemo, useSyncExternalStore } from 'react';
import { onStress, stressMode } from '../state/stress';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { useStore } from '../state/store';
import { printedDate, stressOccupant, twoDrinksOccupant } from './model';
import { SHEETS_UPDATED } from '../state/store';
import { buildPage, occupantFor, sheetsFor, type SheetRef } from './pages';

/** The meal's sheets and a page builder over the live data. */
export function useSheets(site: Site, meal: MealName, opening: MealOpening) {
  const data = useStore((s) => s.data);
  const sheets = useMemo(() => sheetsFor(opening), [opening]);
  // The test app's Stress test: every resident with two drinks and RO water, or a worst-case resident at every seat.
  const stress = useSyncExternalStore(onStress, stressMode);
  const occupant = useMemo(() => {
    if (stress === 'full') return stressOccupant(meal, { heavy: true });
    const real = occupantFor(data, site.id, meal);
    return stress === 'drinks' ? twoDrinksOccupant(real, meal, data.beverages) : real;
  }, [stress, data, site.id, meal]);
  const stamp = data.settings[SHEETS_UPDATED];
  const updated = stamp ? printedDate(new Date(stamp)) : '';
  const page = (sheet: SheetRef) => buildPage(data, site, meal, opening, sheet, occupant, updated);
  return { sheets, page };
}
