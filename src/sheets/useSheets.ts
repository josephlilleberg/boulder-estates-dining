import { useMemo, useSyncExternalStore } from 'react';
import { onStress, stressMode } from '../state/stress';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { useStore } from '../state/store';
import { printedDate, stressOccupant, twoDrinksOccupant } from './model';
import { SHEETS_UPDATED } from '../state/store';
import { buildPage, occupantFor, sheetsFor, type SheetRef } from './pages';

/** The meal's sheets and a page builder over the live data. */
/** "Tue, Nov 24": the day on the sheets. */
export const sheetDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** The meal's sheets for a day (anyone gone that weekday prints as an empty seat) and a page builder over the live data. */
export function useSheets(site: Site, meal: MealName, opening: MealOpening, day: Date = new Date()) {
  const weekday = day.getDay();
  const data = useStore((s) => s.data);
  const sheets = useMemo(() => sheetsFor(opening), [opening]);
  // The test app's Stress test: every resident with two drinks (and RO water), or a worst-case resident at every seat.
  const stress = useSyncExternalStore(onStress, stressMode);
  const occupants = useMemo(() => {
    const of = (day: number | 'all') => {
      if (stress === 'full') return stressOccupant(meal, { heavy: true });
      const real = occupantFor(data, site.id, meal, day);
      return stress === 'off' ? real : twoDrinksOccupant(real, meal, data.beverages, { ro: stress === 'ro' });
    };
    // The setup sheet is printed once and reused: everyone seated, gone ones marked. Server sheets are for the day.
    return { setup: of('all'), day: of(weekday) };
  }, [stress, data, site.id, meal, weekday]);
  const stamp = data.settings[SHEETS_UPDATED];
  const updated = stamp ? printedDate(new Date(stamp)) : '';
  const forDay = sheetDay(day);
  const page = (sheet: SheetRef) =>
    sheet.kind === 'setup' ? buildPage(data, site, meal, opening, sheet, occupants.setup, updated) : buildPage(data, site, meal, opening, sheet, occupants.day, updated, forDay);
  return { sheets, page };
}
