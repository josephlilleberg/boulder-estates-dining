import { useMemo } from 'react';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { useStore } from '../state/store';
import { printedDate } from './model';
import { SHEETS_UPDATED } from '../state/store';
import { buildPage, occupantFor, sheetsFor, type PageData, type SheetRef } from './pages';

/** The meal's sheets and a page builder over the live data. */
/** "Tue, Nov 24": the day on the sheets. */
export const sheetDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** The meal's sheets for a day (anyone gone that weekday prints as an empty seat) and a page builder over the live data. */
export function useSheets(site: Site, meal: MealName, opening: MealOpening, day: Date = new Date()) {
  const weekday = day.getDay();
  const data = useStore((s) => s.data);
  const sheets = useMemo(() => sheetsFor(opening), [opening]);
  // The setup sheet is printed once and reused: everyone seated, gone ones marked. Server sheets are for the day.
  const occupants = useMemo(() => ({ setup: occupantFor(data, site.id, meal, 'all'), day: occupantFor(data, site.id, meal, weekday) }), [data, site.id, meal, weekday]);
  const stamp = data.settings[SHEETS_UPDATED];
  const updated = stamp ? printedDate(new Date(stamp)) : '';
  const forDay = sheetDay(day);
  // Building a page lays out every label (up to a second for a full server sheet), so each is built
  // once and kept until something on it changes; the Sheets tab and the Print window share them.
  const built = useMemo(() => new Map<string, PageData>(), [data, site, meal, opening, occupants, updated, forDay]);
  const page = (sheet: SheetRef) => {
    let p = built.get(sheet.key);
    if (!p) {
      p = sheet.kind === 'setup' ? buildPage(data, site, meal, opening, sheet, occupants.setup, updated) : buildPage(data, site, meal, opening, sheet, occupants.day, updated, forDay);
      built.set(sheet.key, p);
    }
    return p;
  };
  return { sheets, page };
}
