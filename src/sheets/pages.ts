import type { AppData } from '../db/repo';
import { goneOn, isGone, type Resident } from '../domain/model';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { mealRoster, seatKey } from '../screens/seating/model';
import { areaFor, type Area, drawW, LETTER_AREA, NOTES_ROOM, notesHeight, PAGE, serverNotes, serverRoom, setupRoom, type Occupant, type ServerNote, type Paper, type ServerRoom, type SetupRoom } from './model';

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
/** A page's top margin, header (title, and the date the sheets last changed), the gap under it and the 11 px bottom margin; no footer, so the drawing gets the rest. */
export const PAGE_CHROME = 64;
/** A server sheet's drawing area: the page less its side margins, header and bottom margin. */
export const serverArea = (w: number, h: number): Area => ({ w: drawW(w), h: h - PAGE_CHROME - 2 });
/** Room kept under a setup drawing for its key (one row of groups, 49 px) and the gap above it. */
const KEY_ROOM = 64;

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
      /** The drawing's scale: `fit`, or smaller when the notes need more room than the page keeps for them. */
      roomScale: number;
      /** A server sheet with room to spare is laid out smaller and drawn this much larger (see serverGrow). */
      fit?: number;
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
  /** Top right: "Updated Nov 21, 2026". */
  right: string;
  body: PageBody;
}

/**
 * Who sits where at this meal (archived and gone residents and non-attendees never show; nor, given
 * a weekday, anyone gone that day), with their extras
 * in the order of the Extras list in Settings, so every seat lists them the same way.
 */
export function occupantFor(data: Pick<AppData, 'residents' | 'seating'> & Partial<Pick<AppData, 'extraOptions'>>, siteId: string, meal: string, weekday?: number | 'all'): Occupant {
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
    // Gone (until further notice, or on this weekday): the seat is theirs but prints empty.
    // 'all': everyone seated, gone or not (the setup sheet marks them instead).
    const gone = res && weekday !== 'all' && (weekday === undefined ? isGone(res) : goneOn(res, weekday));
    return res && !gone ? inOrder(res) : null;
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

/** Whether a meal's server sheets all share one size (the most crowded section's), or each is as large as it fits. */
export const SHARE_SERVER_SIZE = false;

/** The label scale a meal's server sheets share: the smallest any section needs. Remembered per seating. */
const sharedScales = new WeakMap<Occupant, Map<string, number>>();
function sharedServerScale(tables: Parameters<typeof serverRoom>[0], opening: MealOpening, occupant: Occupant, meal: string, beverages: Parameters<typeof serverRoom>[3], shared: boolean, area: Area): number {
  const key = `${meal}|${area.w}×${area.h}|${tables.map((t) => `${t.id}@${t.shape},${t.x},${t.y},${t.rotation},${t.section}`).join(';')}`;
  let byKey = sharedScales.get(occupant);
  if (!byKey) sharedScales.set(occupant, (byKey = new Map()));
  let k = byKey.get(key);
  if (k === undefined) {
    k = Math.min(...opening.sections.map((s) => serverRoom(tables.filter((t) => t.section === s.section), occupant, meal, beverages, { shared, area }).scale));
    byKey.set(key, k);
  }
  return k;
}

/** How much larger a server sheet may be drawn, tried largest first. */
const SERVER_GROW = [1.6, 1.45, 1.3, 1.2, 1.15, 1.1, 1.05];

/**
 * A server sheet with room to spare (a section with few tables, or tables far apart) is laid out for a
 * smaller page and drawn that much larger: tables, names and drinks alike, so nothing is lost in white
 * space. The most at which every label still fits at full size; 1 when it doesn't even at that.
 */
export function serverGrow(T: Parameters<typeof serverRoom>[0], occupant: Occupant, meal: string, beverages: Parameters<typeof serverRoom>[3], shared: boolean, area: Area = LETTER_AREA): number {
  for (const z of SERVER_GROW) if (serverRoom(T, occupant, meal, beverages, { shared, probe: true, area: { w: area.w / z, h: area.h / z } }).scale >= 1) return z;
  return 1;
}

export function buildPage(
  data: Pick<AppData, 'tables' | 'layouts' | 'beverages'>,
  site: Site,
  meal: MealName,
  opening: MealOpening,
  sheet: SheetRef,
  occupant: Occupant,
  /** When anything on the sheets last changed ("Nov 21, 2026"), shown top right. */
  updated: string,
  /** The day the sheets are for ("Tue, Nov 24"), shown top right before it. */
  forDay = '',
): PageData {
  const layoutId = data.layouts.find((l) => l.siteId === site.id && l.active)?.id;
  const tables = data.tables.filter((t) => t.layoutId === layoutId && opening.sections.some((s) => s.section === t.section));
  const { w, h } = PAGE[sheet.paper];
  const right = [forDay && `For ${forDay}`, updated && `Updated ${updated}`].filter(Boolean).join(' · ');
  const base = { key: sheet.key, paper: sheet.paper, w, h, right };

  if (sheet.kind === 'combined') {
    const room = serverRoom(tables, occupant, meal, data.beverages, { draw: 'both', area: areaFor(w, h, LEGEND_ROOM) });
    const notes = serverNotes(tables, occupant, meal);
    return {
      ...base,
      title: `${meal} · Setup & drinks`,
      body: { kind: 'server', room, notes, legend: 'supper', notesShown: true, roomScale: Math.max(0.5, Math.min(1, (room.h - Math.max(0, notesHeight(notes) - NOTES_ROOM)) / room.h)) },
    };
  }
  if (sheet.kind === 'server') {
    const T = tables.filter((t) => t.section === sheet.section);
    const shared = sharedLayout(opening);
    // No notes list: the drawing gets the whole page under the header. Each section is drawn as large as it
    // fits (z times larger when it has room to spare). With SHARE_SERVER_SIZE, a meal's server sheets would
    // instead share one size, the most crowded section's.
    const area = serverArea(w, h);
    const many = SHARE_SERVER_SIZE && opening.sections.length > 1;
    const maxScale = many ? sharedServerScale(tables, opening, occupant, meal, data.beverages, shared, area) : undefined;
    const z = many ? 1 : serverGrow(T, occupant, meal, data.beverages, shared, area);
    const room = serverRoom(T, occupant, meal, data.beverages, { shared, maxScale, area: { w: area.w / z, h: area.h / z } });
    const label = opening.sections.find((s) => s.section === sheet.section)?.label ?? '';
    return {
      ...base,
      title: `${meal} · ${label}`,
      body: { kind: 'server', room, notes: [], legend: null, notesShown: false, fit: z, roomScale: z },
    };
  }
  // A one-section meal (Breakfast): its server sheet's layout (same tables in the same order, same
  // room per seat), laid out for the 11 × 17 page's shape and enlarged to fill it, so it uses the whole
  // width: as tall as the Letter sheet's area, and as much wider as the page is.
  if (sharedLayout(opening)) {
    const [PW, PH] = [drawW(w), h - PAGE_CHROME - KEY_ROOM];
    const area = { w: (PW * LETTER_AREA.h) / PH, h: LETTER_AREA.h };
    const room = serverRoom(tables, occupant, meal, data.beverages, { draw: 'setup', shared: true, area });
    return {
      ...base,
      title: `${meal} · Setup`,
      body: { kind: 'server', room, notes: [], legend: 'setup', notesShown: false, roomScale: Math.min(PW / (room.w + 2), PH / (room.h + 2)) },
    };
  }
  // Setup: the page less its header and margin, and the room kept for the key.
  return {
    ...base,
    title: `${meal} · Setup`,
    body: { kind: 'setup', room: setupRoom(opening.sections, tables, occupant, meal, drawW(w) + 4, h - PAGE_CHROME - KEY_ROOM) },
  };
}
