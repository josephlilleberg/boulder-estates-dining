import type { AppData } from '../db/repo';
import { arrange, type ArrangeResult, type ArrangeTable, type Party } from '../domain/arrange';
import { shortName, type AttendeeStatus, type DiningEvent, type DiningTable, type EventAttendee, type EventSeat, type Resident } from '../domain/model';
import type { MealName, SiteId } from '../domain/sites';
import { seatCount } from '../domain/tables';
import { del, patch, put, type Op } from './ops';

// Special events (Thanksgiving Dinner) as (data) → ops, each one undo step.
// An event's guest list is a snapshot: made from whoever comes to that meal on the day
// it's created, so later changes to everyday attendance don't reshuffle it.

export const MAX_GUESTS = 20;

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ');

function event(data: AppData, id: string): DiningEvent {
  const e = data.events.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown event ${id}`);
  return e;
}

const attendee = (e: DiningEvent, residentId: string) => e.attendees.find((a) => a.residentId === residentId);
const key = (eventId: string, residentId: string) => ({ event_id: eventId, resident_id: residentId });
const seatKey = (eventId: string, s: Pick<EventSeat, 'tableId' | 'seat'>) => ({ event_id: eventId, table_id: s.tableId, seat: s.seat });
/** Frees a resident's seats (theirs and their guests', or just guests past `keepGuests`). */
const freeSeats = (e: DiningEvent, residentId: string, keepGuests = -1): Op[] =>
  e.seats.filter((s) => s.residentId === residentId && s.guest > keepGuests).map((s) => del('event_seat', seatKey(e.id, s)));

export interface NewEvent {
  siteId: SiteId;
  name: string;
  date: string;
  meal: MealName;
}

const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Starts the guest list with everyone who comes to that meal today. */
export function createEvent(n: NewEvent): { id: string; ops: (data: AppData) => Op[] } {
  const id = crypto.randomUUID();
  return {
    id,
    ops: (data) => {
      const name = tidy(n.name);
      if (!name) throw new Error('The event needs a name');
      if (!validDate(n.date)) throw new Error('The event needs a date');
      const regulars = data.residents.filter((r) => r.siteId === n.siteId && !r.archived && r.attends.includes(n.meal));
      return [put('event', { id, site_id: n.siteId, name, date: n.date, meal: n.meal }), ...regulars.map((r) => put('event_attendee', { ...key(id, r.id), added: 0, status: 'coming', guests: 0 }))];
    },
  };
}

export const editEvent =
  (id: string, name: string, date: string) =>
  (data: AppData): Op[] => {
    const e = event(data, id);
    const n = tidy(name);
    if (!n) throw new Error('The event needs a name');
    if (!validDate(date)) throw new Error('The event needs a date');
    return n === e.name && date === e.date ? [] : [patch('event', { id }, { name: n, date })];
  };

export const deleteEvent =
  (id: string) =>
  (data: AppData): Op[] => {
    const e = event(data, id);
    return [...e.seats.map((s) => del('event_seat', seatKey(id, s))), ...e.attendees.map((a) => del('event_attendee', key(id, a.residentId))), del('event', { id })];
  };

/** Someone who doesn't usually come to this meal. Re-adding a cancelled one marks them coming. */
export const addToEvent =
  (eventId: string, residentId: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (a) return a.status === 'coming' ? [] : [patch('event_attendee', key(eventId, residentId), { status: 'coming' })];
    return [put('event_attendee', { ...key(eventId, residentId), added: 1, status: 'coming', guests: 0 })];
  };

/** Takes an added resident off the list (regulars are cancelled instead, so they stay visible). */
export const removeFromEvent =
  (eventId: string, residentId: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    return attendee(e, residentId) ? [...freeSeats(e, residentId), del('event_attendee', key(eventId, residentId))] : [];
  };

/** Cancelling frees their seats (and their guests'). */
export const setAttendeeStatus =
  (eventId: string, residentId: string, status: AttendeeStatus) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (!a) throw new Error('Not on the guest list');
    if (a.status === status) return [];
    return [...(status === 'cancelled' ? freeSeats(e, residentId) : []), patch('event_attendee', key(eventId, residentId), { status })];
  };

/** Fewer guests frees the extra guests' seats. */
export const setGuests =
  (eventId: string, residentId: string, guests: number) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (!a) throw new Error('Not on the guest list');
    const n = Math.max(0, Math.min(MAX_GUESTS, Math.round(guests)));
    return a.guests === n ? [] : [...freeSeats(e, residentId, n), patch('event_attendee', key(eventId, residentId), { guests: n })];
  };

// ---- Reading -------------------------------------------------------------------------------

export interface ListedAttendee extends EventAttendee {
  resident: Resident;
  /** On the meal plan for the event's meal. */
  onPlan: boolean;
}

/** The guest list with resident details, by last name; archived residents are left out. */
export function guestList(data: AppData, e: DiningEvent): ListedAttendee[] {
  const byId = new Map(data.residents.map((r) => [r.id, r]));
  return e.attendees
    .flatMap((a) => {
      const r = byId.get(a.residentId);
      return r && !r.archived ? [{ ...a, resident: r, onPlan: r.onPlan.includes(e.meal) }] : [];
    })
    .sort((a, b) => a.resident.last.localeCompare(b.resident.last) || a.resident.first.localeCompare(b.resident.first));
}

/** The event's tables: the active layout's, in the sections open at its meal. */
export function eventTables(data: AppData, e: DiningEvent): DiningTable[] {
  const open = new Set(
    data.sites
      .find((s) => s.id === e.siteId)
      ?.meals.find((m) => m.meal === e.meal)
      ?.sections.map((s) => s.section) ?? [],
  );
  const layoutIds = new Set(data.layouts.filter((l) => l.siteId === e.siteId && l.active).map((l) => l.id));
  return data.tables.filter((t) => layoutIds.has(t.layoutId) && open.has(t.section));
}

export interface EventTotals {
  residents: number;
  guests: number;
  people: number;
  cancelled: number;
  /** Seats at the tables open for the event's meal. */
  seats: number;
}

export function eventTotals(data: AppData, e: DiningEvent): EventTotals {
  const list = guestList(data, e);
  const coming = list.filter((a) => a.status === 'coming');
  const guests = coming.reduce((n, a) => n + a.guests, 0);
  const seats = eventTables(data, e).reduce((n, t) => n + seatCount(t.shape), 0);
  return { residents: coming.length, guests, people: coming.length + guests, cancelled: list.length - coming.length, seats };
}

// ---- Seating ---------------------------------------------------------------------------------

/** Everyone coming, as parties, with their everyday table and seat at this meal. */
export function eventParties(data: AppData, e: DiningEvent): Party[] {
  const open = new Set(eventTables(data, e).map((t) => t.id));
  return guestList(data, e)
    .filter((a) => a.status === 'coming')
    .map((a) => {
      const usual = data.seating.find((s) => s.siteId === e.siteId && s.meal === e.meal && s.residentId === a.residentId && open.has(s.tableId));
      return { residentId: a.residentId, name: shortName(a.resident), guests: a.guests, usualTable: usual?.tableId ?? null, usualSeat: usual?.seat ?? null, added: a.added };
    });
}

/** What arranging would do, without saving (the screen asks before going over). */
export function planSeats(data: AppData, e: DiningEvent, allowOver = false): ArrangeResult {
  const sections = data.sites.find((x) => x.id === e.siteId)?.meals.find((m) => m.meal === e.meal)?.sections ?? [];
  const tables: ArrangeTable[] = eventTables(data, e).map((t) => {
    const sec = sections.length > 1 ? sections.find((x) => x.section === t.section)?.label : undefined;
    return { id: t.id, section: t.section, number: t.number, seats: seatCount(t.shape), label: sec ? `Table ${t.number} (${sec})` : `Table ${t.number}` };
  });
  return arrange(tables, eventParties(data, e), { allowOver });
}

/** Replaces the event's seating with a fresh arrangement (one undo step). */
export const arrangeSeats =
  (eventId: string, allowOver = false) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const plan = planSeats(data, e, allowOver);
    return [
      ...e.seats.map((s) => del('event_seat', seatKey(eventId, s))),
      ...plan.seats.map((s) => put('event_seat', { ...seatKey(eventId, s), resident_id: s.residentId, guest: s.guest, pinned: 0 })),
    ];
  };

export interface SeatingState {
  /** People coming without a seat (a resident is guest 0, their guests 1..n). */
  unseated: { residentId: string; guest: number }[];
  /** Tables with extra places: table id → how many over. */
  over: Map<string, number>;
}

export function seatingState(data: AppData, e: DiningEvent): SeatingState {
  const tables = new Map(eventTables(data, e).map((t) => [t.id, seatCount(t.shape)]));
  const has = new Set(e.seats.filter((s) => tables.has(s.tableId)).map((s) => `${s.residentId}|${s.guest}`));
  const unseated = guestList(data, e)
    .filter((a) => a.status === 'coming')
    .flatMap((a) => Array.from({ length: a.guests + 1 }, (_, guest) => ({ residentId: a.residentId, guest })))
    .filter((x) => !has.has(`${x.residentId}|${x.guest}`));
  const over = new Map<string, number>();
  for (const s of e.seats) {
    const n = tables.get(s.tableId);
    if (n !== undefined && s.seat >= n) over.set(s.tableId, (over.get(s.tableId) ?? 0) + 1);
  }
  return { unseated, over };
}
