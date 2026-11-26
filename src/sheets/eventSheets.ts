import type { AppData } from '../db/repo';
import type { DiningEvent, Resident } from '../domain/model';
import type { Site } from '../domain/sites';
import { seatKey } from '../screens/seating/model';
import { seatCount } from '../domain/tables';
import { eventTables } from '../state/eventActions';
import type { Occupant } from './model';
import { buildPage, orderExtras, sheetsFor, type PageData, type SheetRef } from './pages';

// An event's Setup and Server sheets: the everyday sheets for its meal, drawn from the event's
// arranged seats instead of everyday seating. Residents print with their own chair and drinks;
// a guest prints as "+ Kim A." (with Kim A.) with an ordinary chair and blank drinks to fill in by hand.

/** Who sits where at the event, by its arranged seats. */
export function eventOccupant(data: AppData, e: DiningEvent): Occupant {
  const order = data.extraOptions.filter((x) => x.siteId === e.siteId).map((x) => x.name);
  const byId = new Map(data.residents.map((r) => [r.id, r]));
  const bySeat = new Map<string, Resident>();
  for (const s of e.seats) {
    const host = byId.get(s.residentId);
    if (!host) continue;
    if (s.guest === 0) {
      const p = host.prefs[e.meal];
      bySeat.set(seatKey(s.tableId, s.seat), p ? { ...host, prefs: { ...host.prefs, [e.meal]: { ...p, extras: orderExtras(p.extras, order) } } } : host);
    } else {
      bySeat.set(seatKey(s.tableId, s.seat), {
        ...host,
        id: `guest:${host.id}:${s.guest}`,
        first: 'Guest',
        // "+ Kim A.": as short as a resident's name, so it fits a seat's label.
        nickname: `+ ${host.nickname || host.first}`,
        chair: 'arm',
        diabetic: false,
        notes: [],
        prefs: {},
      });
    }
  }
  return (tableId, seat) => bySeat.get(seatKey(tableId, seat)) ?? null;
}

export interface EventSheets {
  sheets: SheetRef[];
  page: (sheet: SheetRef) => PageData;
  /** People in extra places past a table's seats, which the sheets have no seat to draw at. */
  extra: number;
}

/** The event's sheets and a page builder (each page built once, when first asked for). */
export function eventSheets(data: AppData, site: Site, e: DiningEvent, dateText: string): EventSheets | null {
  const opening = site.meals.find((m) => m.meal === e.meal);
  if (!opening) return null;
  const occupant = eventOccupant(data, e);
  const built = new Map<string, PageData>();
  const page = (sheet: SheetRef) => {
    let p = built.get(sheet.key);
    if (!p) {
      p = buildPage(data, site, e.meal, opening, sheet, occupant, '', dateText);
      // "Dinner · Setup" → "Christmas Dinner · Setup"
      p = { ...p, title: `${e.name} · ${p.title.slice(p.title.indexOf('·') + 2)}` };
      built.set(sheet.key, p);
    }
    return p;
  };
  const seats = new Map(eventTables(data, e).map((t) => [t.id, seatCount(t.shape)]));
  const extra = e.seats.filter((s) => s.seat >= (seats.get(s.tableId) ?? 0)).length;
  return { sheets: sheetsFor(opening), page, extra };
}
