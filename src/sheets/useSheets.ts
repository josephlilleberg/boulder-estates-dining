import { useMemo } from 'react';
import type { MealName, MealOpening, Site } from '../domain/sites';
import type { AppData } from '../db/repo';
import { useStore } from '../state/store';
import { printedDate } from './model';
import { SHEETS_UPDATED } from '../state/store';
import { buildPage, occupantFor, sheetsFor, type PageData, type SheetRef } from './pages';

/** "Tue, Nov 24": the day on the sheets. */
export const sheetDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export interface MealSheets {
  meal: MealName;
  sheets: SheetRef[];
  page: (sheet: SheetRef) => PageData;
}

/**
 * A meal's sheets for a day (anyone gone that weekday prints as an empty seat) and a page builder.
 * Building a page lays out every label (up to a second for a full server sheet), so each is built
 * the first time it's asked for and kept; a new builder is made whenever the data or the day changes.
 */
function mealSheets(data: AppData, site: Site, opening: MealOpening, day: Date): MealSheets {
  const meal = opening.meal;
  const stamp = data.settings[SHEETS_UPDATED];
  const updated = stamp ? printedDate(new Date(stamp)) : '';
  const forDay = sheetDay(day);
  const built = new Map<string, PageData>();
  // The setup sheet is printed once and reused: everyone seated, gone ones marked. Server sheets are for the day.
  let occupants: { setup: ReturnType<typeof occupantFor>; day: ReturnType<typeof occupantFor> } | null = null;
  const page = (sheet: SheetRef) => {
    let p = built.get(sheet.key);
    if (!p) {
      occupants ??= { setup: occupantFor(data, site.id, meal, 'all'), day: occupantFor(data, site.id, meal, day.getDay()) };
      p = sheet.kind === 'setup' ? buildPage(data, site, meal, opening, sheet, occupants.setup, updated) : buildPage(data, site, meal, opening, sheet, occupants.day, updated, forDay);
      built.set(sheet.key, p);
    }
    return p;
  };
  return { meal, sheets: sheetsFor(opening), page };
}

/**
 * Every meal's sheets at the site, so the Print window can offer them all; the screen shows one meal's.
 * Pages are shared, so the one on screen is already built when the Print window opens.
 */
export function useAllSheets(site: Site, day: Date = new Date()): MealSheets[] {
  const data = useStore((s) => s.data);
  const dayKey = sheetDay(day);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the day matters only as the date it names
  return useMemo(() => site.meals.map((opening) => mealSheets(data, site, opening, day)), [data, site, dayKey]);
}
