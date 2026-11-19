import type { AppData } from '../db/repo';
import type { AttendeeStatus, DiningEvent, EventAttendee, Resident } from '../domain/model';
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

export interface NewEvent {
  siteId: SiteId;
  name: string;
  date: string;
  meal: MealName;
}

/** Starts the guest list with everyone who comes to that meal today. */
export function createEvent(n: NewEvent): { id: string; ops: (data: AppData) => Op[] } {
  const id = crypto.randomUUID();
  return {
    id,
    ops: (data) => {
      const name = tidy(n.name);
      if (!name) throw new Error('The event needs a name');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) throw new Error('The event needs a date');
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('The event needs a date');
    return n === e.name && date === e.date ? [] : [patch('event', { id }, { name: n, date })];
  };

export const deleteEvent =
  (id: string) =>
  (data: AppData): Op[] => {
    const e = event(data, id);
    return [...e.attendees.map((a) => del('event_attendee', key(id, a.residentId))), del('event', { id })];
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
  (data: AppData): Op[] =>
    attendee(event(data, eventId), residentId) ? [del('event_attendee', key(eventId, residentId))] : [];

export const setAttendeeStatus =
  (eventId: string, residentId: string, status: AttendeeStatus) =>
  (data: AppData): Op[] => {
    const a = attendee(event(data, eventId), residentId);
    if (!a) throw new Error('Not on the guest list');
    return a.status === status ? [] : [patch('event_attendee', key(eventId, residentId), { status })];
  };

export const setGuests =
  (eventId: string, residentId: string, guests: number) =>
  (data: AppData): Op[] => {
    const a = attendee(event(data, eventId), residentId);
    if (!a) throw new Error('Not on the guest list');
    const n = Math.max(0, Math.min(MAX_GUESTS, Math.round(guests)));
    return a.guests === n ? [] : [patch('event_attendee', key(eventId, residentId), { guests: n })];
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
  const open = new Set(
    data.sites
      .find((s) => s.id === e.siteId)
      ?.meals.find((m) => m.meal === e.meal)
      ?.sections.map((s) => s.section) ?? [],
  );
  const layoutIds = new Set(data.layouts.filter((l) => l.siteId === e.siteId && l.active).map((l) => l.id));
  const seats = data.tables.filter((t) => layoutIds.has(t.layoutId) && open.has(t.section)).reduce((n, t) => n + seatCount(t.shape), 0);
  return { residents: coming.length, guests, people: coming.length + guests, cancelled: list.length - coming.length, seats };
}
