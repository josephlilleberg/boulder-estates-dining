import type { AppData } from '../db/repo';
import type { MealName, MealOpening, Site } from '../domain/sites';
import { mealRoster, seatKey } from '../screens/seating/model';
import { PAGE, prefRows, serverRoom, setupRoom, type Occupant, type Paper, type PrefRow, type ServerRoom, type SetupRoom } from './model';

// The printable sheets for a meal and the data each page draws. Shared by View,
// Print preview and the printed output, so all three are the same page.

export type SheetKind = 'setup' | 'server' | 'prefs';

export interface SheetRef {
  key: string;
  kind: SheetKind;
  /** View pill: "Setup", "Server · Section 1", "Allergies & notes". */
  label: string;
  /** Print checkbox title and its one-line description. */
  printLabel: string;
  sub: string;
  /** Print preview tab: "Setup", "Server · S1", "Allergies & notes". */
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
    { key: 'prefs', kind: 'prefs', label: 'Allergies & notes', printLabel: 'Allergies & notes', sub: 'Allergies, notes and half portions by table', tab: 'Allergies & notes', paper: 'letter' },
  ];
}

export type PageBody = { kind: 'server'; room: ServerRoom } | { kind: 'setup'; room: SetupRoom } | { kind: 'prefs'; rows: PrefRow[] };

export interface PageData {
  key: string;
  paper: Paper;
  w: number;
  h: number;
  title: string;
  right: string;
  legendHead: string;
  legendText: string;
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
    const label = opening.sections.find((s) => s.section === sheet.section)?.label ?? '';
    return {
      ...base,
      title: `${meal} · ${label}`,
      right: `Server sheet · ${site.name}`,
      legendHead: 'Key',
      legendText: 'Each label is a drink. Dark ½ tab = half glass of milk. Coffee isn’t shown; everyone is offered it.',
      body: { kind: 'server', room: serverRoom(tables.filter((t) => t.section === sheet.section), occupant, meal, data.beverages) },
    };
  }
  if (sheet.kind === 'setup') {
    // 150 px of header/footer, 20 px gap and 84 px kept free for the legend.
    return {
      ...base,
      title: `${meal} · Setup`,
      right: `Setup sheet · ${site.name}`,
      legendHead: '',
      legendText: '',
      body: { kind: 'setup', room: setupRoom(opening.sections, tables, occupant, meal, w - 80, h - 150 - 20 - 84) },
    };
  }
  return {
    ...base,
    title: `${meal} · Allergies & notes`,
    right: `Allergies & notes · ${site.name}`,
    legendHead: 'Note',
    legendText: 'Only residents with allergies, notes or a half portion are listed.',
    body: { kind: 'prefs', rows: prefRows(opening.sections, tables, occupant, meal) },
  };
}
