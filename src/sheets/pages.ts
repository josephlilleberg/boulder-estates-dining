import type { AppData } from '../db/repo';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { mealRoster, seatKey } from '../screens/seating/model';
import { NOTES_ROOM, notesHeight, PAGE, serverNotes, serverRoom, setupRoom, type Occupant, type ServerNote, type Paper, type ServerRoom, type SetupRoom } from './model';

// The printable sheets for a meal and the data each page draws. Shared by View,
// Print preview and the printed output, so all three are the same page.

export type SheetKind = 'setup' | 'server';

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

export function sheetsFor(opening: MealOpening): SheetRef[] {
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

/** Who sits where at this meal (archived residents and non-attendees never show). */
export function occupantFor(data: Pick<AppData, 'residents' | 'seating'>, siteId: string, meal: string): Occupant {
  const r = mealRoster(data.residents, data.seating, siteId, meal);
  return (tableId, seat) => r.bySeat.get(seatKey(tableId, seat)) ?? null;
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

  if (sheet.kind === 'server') {
    const T = tables.filter((t) => t.section === sheet.section);
    const room = serverRoom(T, occupant, meal, data.beverages);
    const notes = serverNotes(T, occupant, meal);
    const label = opening.sections.find((s) => s.section === sheet.section)?.label ?? '';
    return {
      ...base,
      title: `${meal} · ${label}`,
      right: `Server sheet · ${site.name}`,
      body: { kind: 'server', room, notes, roomScale: Math.max(0.5, Math.min(1, (room.h - Math.max(0, notesHeight(notes) - NOTES_ROOM)) / room.h)) },
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
