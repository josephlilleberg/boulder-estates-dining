import type { AppData } from '../db/repo';
import type { Resident } from '../domain/model';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { mealRoster, seatKey } from '../screens/seating/model';
import { areaFor, NOTES_ROOM, notesHeight, PAGE, serverNotes, serverRoom, setupRoom, type Occupant, type ServerNote, type Paper, type ServerRoom, type SetupRoom } from './model';

// The printable sheets for a meal and the data each page draws. Shared by View,
// Print preview and the printed output, so all three are the same page.

export type SheetKind = 'setup' | 'server' | 'combined';

export interface SheetRef {
  key: string;
  kind: SheetKind;
  /** View pill: "Setup", "Server · Section 1". */
  label: string;
  /** Print checkbox title and its one-line description. */
  printLabel: string;
  sub: string;
  /** Print preview tab: "Setup", "Server · S1". */
  tab: string;
  paper: Paper;
  /** Physical section, for server sheets. */
  section?: number;
}

/** A meal with one section and separate sheets (Breakfast): its setup and server sheets share one layout. */
export const sharedLayout = (opening: MealOpening) => opening.sections.length === 1 && !COMBINED_MEALS.includes(opening.meal);

/** Supper is one page: setup chips and drinks at each seat together, on 11 × 17. */
export const COMBINED_MEALS: string[] = ['Supper'];
/** Height kept under the combined sheet's drawing for its key. */
const LEGEND_ROOM = 96;

export function sheetsFor(opening: MealOpening): SheetRef[] {
  if (COMBINED_MEALS.includes(opening.meal)) {
    return [{ key: 'combined', kind: 'combined', label: 'Setup & drinks', printLabel: 'Setup & drinks', sub: 'Setup and drinks at every seat, on one 11 × 17 page', tab: 'Setup & drinks', paper: 'tabloid' }];
  }
  const many = opening.sections.length > 1;
  return [
    { key: 'setup', kind: 'setup', label: 'Setup', printLabel: 'Setup sheet', sub: 'The whole dining room on one 11 × 17 page', tab: 'Setup', paper: 'tabloid' },
    ...opening.sections.map(
      (s): SheetRef => ({
        key: `server-${s.section}`,
        kind: 'server',
        label: `Server · ${s.label}`,
        printLabel: `Server sheet · ${s.label}`,
        sub: 'Just this section, for its server',
        tab: many ? `Server · S${s.section}` : 'Server',
        paper: 'letter',
        section: s.section,
      }),
    ),
  ];
}

export type PageBody =
  | {
      kind: 'server';
      room: ServerRoom;
      /** Allergies, notes and ½ portions, listed under the drawing (no key: the labels explain themselves). */
      notes: ServerNote[];
      /** The drawing's scale: 1, or smaller when the notes need more room than the page keeps for them. */
      roomScale: number;
      /** The key under the drawing: Supper's (+ squares) or a one-section setup sheet's (Breakfast); none on server sheets. */
      legend: 'supper' | 'setup' | null;
      /** Allergies and notes under the drawing (not on a setup sheet). */
      notesShown: boolean;
    } | { kind: 'setup'; room: SetupRoom };

export interface PageData {
  key: string;
  paper: Paper;
  w: number;
  h: number;
  title: string;
  right: string;
  footer: string;
  body: PageBody;
}

/**
 * Who sits where at this meal (archived residents and non-attendees never show), with their extras
 * in the order of the Extras list in Settings, so every seat lists them the same way.
 */
export function occupantFor(data: Pick<AppData, 'residents' | 'seating'> & Partial<Pick<AppData, 'extraOptions'>>, siteId: string, meal: string): Occupant {
  const r = mealRoster(data.residents, data.seating, siteId, meal);
  const order = (data.extraOptions ?? []).filter((x) => x.siteId === siteId).map((x) => x.name);
  const sorted = new Map<Resident, Resident>();
  const inOrder = (res: Resident) => {
    let out = sorted.get(res);
    if (!out) {
      const p = res.prefs[meal as MealName];
      out = p ? { ...res, prefs: { ...res.prefs, [meal]: { ...p, extras: orderExtras(p.extras, order) } } } : res;
      sorted.set(res, out);
    }
    return out;
  };
  return (tableId, seat) => {
    const res = r.bySeat.get(seatKey(tableId, seat));
    return res ? inOrder(res) : null;
  };
}

/** Extras in the Settings list's order; any not on the list go last, alphabetically. */
export function orderExtras<T extends { name: string }>(extras: T[], order: string[]): T[] {
  const rank = (n: string) => {
    const i = order.indexOf(n);
    return i < 0 ? order.length : i;
  };
  return [...extras].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export function buildPage(
  data: Pick<AppData, 'tables' | 'layouts' | 'beverages'>,
  site: Site,
  meal: MealName,
  opening: MealOpening,
  sheet: SheetRef,
  occupant: Occupant,
  pageNo: number,
  pageCount: number,
  today: string,
): PageData {
  const layoutId = data.layouts.find((l) => l.siteId === site.id && l.active)?.id;
  const tables = data.tables.filter((t) => t.layoutId === layoutId && opening.sections.some((s) => s.section === t.section));
  const { w, h, name } = PAGE[sheet.paper];
  const footer = `${name} · Printed ${today} · Page ${pageNo} of ${Math.max(pageCount, 1)}`;
  const base = { key: sheet.key, paper: sheet.paper, w, h, footer };

  if (sheet.kind === 'combined') {
    const room = serverRoom(tables, occupant, meal, data.beverages, { draw: 'both', area: areaFor(w, h, LEGEND_ROOM) });
    const notes = serverNotes(tables, occupant, meal);
    return {
      ...base,
      title: `${meal} · Setup & drinks`,
      right: `Setup & drinks · ${site.name}`,
      body: { kind: 'server', room, notes, legend: 'supper', notesShown: true, roomScale: Math.max(0.5, Math.min(1, (room.h - Math.max(0, notesHeight(notes) - NOTES_ROOM)) / room.h)) },
    };
  }
  if (sheet.kind === 'server') {
    const T = tables.filter((t) => t.section === sheet.section);
    const room = serverRoom(T, occupant, meal, data.beverages, { shared: sharedLayout(opening) });
    const notes = serverNotes(T, occupant, meal);
    const label = opening.sections.find((s) => s.section === sheet.section)?.label ?? '';
    return {
      ...base,
      title: `${meal} · ${label}`,
      right: `Server sheet · ${site.name}`,
      body: { kind: 'server', room, notes, legend: null, notesShown: true, roomScale: Math.max(0.5, Math.min(1, (room.h - Math.max(0, notesHeight(notes) - NOTES_ROOM)) / room.h)) },
    };
  }
  // A one-section meal (Breakfast): the same layout as its server sheet, drawn at Letter size and
  // enlarged to fill the 11 × 17 page, so tables, gaps and labels keep identical proportions.
  if (sharedLayout(opening)) {
    const room = serverRoom(tables, occupant, meal, data.beverages, { draw: 'setup', shared: true });
    return {
      ...base,
      title: `${meal} · Setup`,
      right: `Setup sheet · ${site.name}`,
      body: { kind: 'server', room, notes: [], legend: 'setup', notesShown: false, roomScale: Math.min((w - 84) / (room.w + 2), (h - 150 - 20 - 84) / (room.h + 2)) },
    };
  }
  // Setup: 150 px of header/footer, 20 px gap and 84 px kept free for the chair key.
  return {
    ...base,
    title: `${meal} · Setup`,
    right: `Setup sheet · ${site.name}`,
    body: { kind: 'setup', room: setupRoom(opening.sections, tables, occupant, meal, w - 80, h - 150 - 20 - 84) },
  };
}
