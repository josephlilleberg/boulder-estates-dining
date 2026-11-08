import { useMemo } from 'react';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { useStore } from '../state/store';
import { printedDate, stressOccupant } from './model';
import { buildPage, occupantFor, sheetsFor, type SheetRef } from './pages';

/** The meal's sheets and a page builder over the live data. Pages are numbered within `numbering`. */
export function useSheets(site: Site, meal: MealName, opening: MealOpening) {
  const data = useStore((s) => s.data);
  const sheets = useMemo(() => sheetsFor(opening), [opening]);
  // Dev builds only: ?stress puts a two-drink resident at every seat to eyeball spacing.
  const stress = import.meta.env.DEV && new URLSearchParams(window.location.search).has('stress');
  const occupant = useMemo(() => (stress ? stressOccupant(meal) : occupantFor(data, site.id, meal)), [stress, data, site.id, meal]);
  const today = printedDate(new Date());
  const page = (sheet: SheetRef, numbering: SheetRef[] = sheets) =>
    buildPage(data, site, meal, opening, sheet, occupant, numbering.indexOf(sheet) + 1, numbering.length, today);
  return { sheets, page };
}
