import { useMemo, useSyncExternalStore } from 'react';
import { onStress, stressOn } from '../state/stress';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { useStore } from '../state/store';
import { printedDate, stressOccupant } from './model';
import { SHEETS_UPDATED } from '../state/store';
import { buildPage, occupantFor, sheetsFor, type SheetRef } from './pages';

/** The meal's sheets and a page builder over the live data. */
export function useSheets(site: Site, meal: MealName, opening: MealOpening) {
  const data = useStore((s) => s.data);
  const sheets = useMemo(() => sheetsFor(opening), [opening]);
  // The test app's Stress test switch: a worst-case resident at every seat, to see crowded sheets.
  const stress = useSyncExternalStore(onStress, stressOn);
  const occupant = useMemo(() => (stress ? stressOccupant(meal, { heavy: true }) : occupantFor(data, site.id, meal)), [stress, data, site.id, meal]);
  const stamp = data.settings[SHEETS_UPDATED];
  const updated = stamp ? printedDate(new Date(stamp)) : '';
  const page = (sheet: SheetRef) => buildPage(data, site, meal, opening, sheet, occupant, updated);
  return { sheets, page };
}
