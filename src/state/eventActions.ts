import type { AppData } from '../db/repo';
import { arrange, type ArrangeResult, type ArrangeTable, type Party } from '../domain/arrange';
import { isAway, shortName, type AttendeeStatus, type DiningEvent, type DiningTable, type EventAttendee, type EventSeat, type Resident } from '../domain/model';
import type { MealName, SiteId } from '../domain/sites';
import { seatCount } from '../domain/tables';
import { del, patch, put, type Op } from './ops';

// Special events (Thanksgiving Dinner) as (data) → ops, each one undo step.
// An event's guest list is a snapshot: made from whoever comes to that meal on the day
// it's created, so later changes to everyday attendance don't reshuffle it. The one exception
// is joining: someone new to the meal (added, starts coming, back from away, restored) joins
// the events for it (see joinEvents).

export const MAX_GUESTS = 20;

/**
 * The site's events for these meals that don't list the resident yet: they join as coming, whatever
 * the event's date. Events that already list them (coming or cancelled) are left alone.
 */
export function joinEvents(data: AppData, residentId: string, siteId: SiteId, meals: MealName[]): Op[] {
  return data.events
    .filter((e) => e.siteId === siteId && meals.includes(e.meal) && !e.attendees.some((a) => a.residentId === residentId))
    .map((e) => put('event_attendee', { event_id: e.id, resident_id: residentId, added: 0, status: 'coming', guests: 0 }));
}

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
      const regulars = data.residents.filter((r) => r.siteId === n.siteId && !r.archived && !isAway(r) && r.attends.includes(n.meal));
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

/**
 * Puts someone on the Additions list with no guests: someone who usually comes is listed there,
 * anyone else is added to the event. (Guests are set on the list afterwards.)
 */
export const addToAdditions =
  (eventId: string, residentId: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (!a) return addToEvent(eventId, residentId)(data);
    const ops: Op[] = a.status === 'coming' ? [] : [patch('event_attendee', key(eventId, residentId), { status: 'coming' })];
    return a.added || a.listed ? ops : [...ops, patch('event_attendee', key(eventId, residentId), { listed: 1 })];
  };

/** × on the Additions list: an added resident leaves the event; someone who usually comes just loses their guests. */
export const removeFromAdditions =
  (eventId: string, residentId: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (!a) return [];
    if (a.added) return removeFromEvent(eventId, residentId)(data);
    return [...freeSeats(e, residentId, 0), patch('event_attendee', key(eventId, residentId), { listed: 0, guests: 0 })];
  };

/** On the Additions list: added for the event, listed there, or bringing guests. */
export const inAdditions = (a: EventAttendee) => a.status === 'coming' && (a.added || a.listed || a.guests > 0);

// ---- Relatives ------------------------------------------------------------------------------

/** Everyone in `residentId`'s family at this event (themselves included), or just them. */
export const relativesOf = (e: DiningEvent, residentId: string): string[] => {
  const f = attendee(e, residentId)?.family;
  return f ? e.attendees.filter((a) => a.family === f).map((a) => a.residentId) : [residentId];
};

/** Makes two people at the event relatives; their families (if any) become one. */
export const linkRelatives =
  (eventId: string, a: string, b: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const fa = attendee(e, a);
    const fb = attendee(e, b);
    if (!fa || !fb) throw new Error('Not on the guest list');
    if (a === b || (fa.family && fa.family === fb.family)) return [];
    const family = fa.family ?? fb.family ?? crypto.randomUUID();
    const members = new Set([...relativesOf(e, a), ...relativesOf(e, b)]);
    return [...members].filter((r) => attendee(e, r)!.family !== family).map((r) => patch('event_attendee', key(eventId, r), { family }));
  };

/** Takes someone out of their family; a family left with one person is no family. */
export const unlinkRelative =
  (eventId: string, residentId: string) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const a = attendee(e, residentId);
    if (!a?.family) return [];
    const rest = relativesOf(e, residentId).filter((r) => r !== residentId);
    return [residentId, ...(rest.length === 1 ? rest : [])].map((r) => patch('event_attendee', key(eventId, r), { family: null }));
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

/** "Table 3", or "Table 3 (Section 2)" when the meal has more than one section (numbers repeat). */
export function tableLabel(data: AppData, e: DiningEvent, t: DiningTable): string {
  const sections = data.sites.find((x) => x.id === e.siteId)?.meals.find((m) => m.meal === e.meal)?.sections ?? [];
  const sec = sections.length > 1 ? sections.find((x) => x.section === t.section)?.label : undefined;
  return sec ? `Table ${t.number} (${sec})` : `Table ${t.number}`;
}

/** What arranging would do, without saving (the screen asks before going over). Pinned seats stay. */
export function planSeats(data: AppData, e: DiningEvent, allowOver = false): ArrangeResult {
  const tables: ArrangeTable[] = eventTables(data, e).map((t) => ({ id: t.id, section: t.section, number: t.number, seats: seatCount(t.shape), label: tableLabel(data, e, t) }));
  const fixed = e.seats.filter((s) => s.pinned);
  const { parties, slots } = withFamilies(e, eventParties(data, e), new Set(fixed.map((s) => s.residentId)));
  const r = arrange(tables, parties, { allowOver, fixed });
  // A family's seats come back as one party's (its first member and "guests"); give each seat its person.
  return { ...r, seats: r.seats.map((s) => ({ ...s, ...(slots.get(s.residentId)?.[s.guest] ?? {}) })) };
}

/**
 * Relatives coming to the event become one party: the first of them (with an everyday seat, if any)
 * and everyone else, relatives and guests, as that party's "guests", in order, so they sit side by
 * side at one table. A family with anyone pinned is left to the pins. `slots` maps each merged
 * party's seats back to the real person: slots[first][g] = who sits in "guest" g's seat.
 */
function withFamilies(e: DiningEvent, parties: Party[], pinned: Set<string>) {
  const byId = new Map(parties.map((p) => [p.residentId, p]));
  const families = new Map<string, Party[]>();
  for (const a of e.attendees) {
    const p = a.family ? byId.get(a.residentId) : undefined;
    if (p) families.set(a.family!, [...(families.get(a.family!) ?? []), p]);
  }
  const slots = new Map<string, { residentId: string; guest: number }[]>();
  const merged = new Set<string>();
  const out: Party[] = [];
  for (const ps of families.values()) {
    if (ps.length < 2 || ps.some((p) => pinned.has(p.residentId))) continue;
    const members = [...ps].sort((a, b) => Number(!a.usualTable) - Number(!b.usualTable) || a.name.localeCompare(b.name));
    const first = members[0]!;
    slots.set(
      first.residentId,
      members.flatMap((m) => Array.from({ length: 1 + m.guests }, (_, g) => ({ residentId: m.residentId, guest: g }))),
    );
    for (const m of members) merged.add(m.residentId);
    const guests = members.reduce((n, m) => n + m.guests, 0);
    const who = members.map((m) => m.name);
    const label = `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]} (relatives${guests ? `, +${guests}` : ''})`;
    out.push({ ...first, guests: members.length - 1 + guests, added: members.every((m) => m.added), label });
  }
  return { parties: [...out, ...parties.filter((p) => !merged.has(p.residentId))], slots };
}

/** Re-seats everyone who isn't pinned (one undo step). */
export const arrangeSeats =
  (eventId: string, allowOver = false) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    const plan = planSeats(data, e, allowOver);
    return [
      ...e.seats.filter((s) => !s.pinned).map((s) => del('event_seat', seatKey(eventId, s))),
      ...plan.seats.map((s) => put('event_seat', { ...seatKey(eventId, s), resident_id: s.residentId, guest: s.guest, pinned: 0 })),
    ];
  };

// ---- Moving by hand ----------------------------------------------------------------------------
// Anything moved by hand is pinned, so Arrange again leaves it where it is.

export interface Who {
  residentId: string;
  /** 0 is the resident, 1..n their guests. */
  guest: number;
}

const seatRow = (eventId: string, s: Pick<EventSeat, 'tableId' | 'seat'>, who: Who) => ({ ...seatKey(eventId, s), resident_id: who.residentId, guest: who.guest, pinned: 1 });

/**
 * Seats someone (seated or not) at an empty seat, or swaps two people. A resident brings their
 * guests to the new table; a guest stays at their host's table. Returns the ops, or why not.
 */
export function planMove(data: AppData, e: DiningEvent, who: Who, target: Pick<EventSeat, 'tableId' | 'seat'>): { ops: Op[] } | { error: string } {
  const t = eventTables(data, e).find((x) => x.id === target.tableId);
  const a = e.attendees.find((x) => x.residentId === who.residentId && x.status === 'coming');
  const r = data.residents.find((x) => x.id === who.residentId);
  if (!t || target.seat >= seatCount(t.shape) || !a || !r || who.guest > a.guests) return { error: 'That seat isn’t available.' };
  const n = seatCount(t.shape);
  const label = tableLabel(data, e, t);
  const party = e.seats.filter((s) => s.residentId === who.residentId);
  const cur = party.find((s) => s.guest === who.guest);
  const occ = e.seats.find((s) => s.tableId === t.id && s.seat === target.seat);
  if (occ && cur && occ.tableId === cur.tableId && occ.seat === cur.seat) return { ops: [] };
  const del2 = (x: EventSeat) => del('event_seat', seatKey(e.id, x));
  const swap = (x: EventSeat, y: EventSeat): { ops: Op[] } => ({ ops: [del2(x), del2(y), put('event_seat', seatRow(e.id, y, x)), put('event_seat', seatRow(e.id, x, y))] });

  // Someone's in the seat: swap, when nobody ends up away from their party.
  if (occ) {
    if (!cur) return { error: 'That seat is taken. Drop them on an empty seat.' };
    if (cur.tableId === occ.tableId) return swap(cur, occ);
    // Two parties of the same size, each seated together: they trade places, guests included.
    const whole = (x: EventSeat) => {
      const ps = e.seats.filter((y) => y.residentId === x.residentId).sort((p, q) => p.guest - q.guest);
      const size = 1 + (e.attendees.find((y) => y.residentId === x.residentId)?.guests ?? 0);
      return x.guest === 0 && ps.length === size && ps.every((y) => y.tableId === x.tableId) ? ps : null;
    };
    const mine = whole(cur);
    const theirs = whole(occ);
    if (mine && theirs && mine.length === theirs.length) {
      return {
        ops: [...mine.map(del2), ...theirs.map(del2), ...mine.map((x, i) => put('event_seat', seatRow(e.id, theirs[i]!, x))), ...theirs.map((y, i) => put('event_seat', seatRow(e.id, mine[i]!, y)))],
      };
    }
    if (cur.guest > 0 || occ.guest > 0) return { error: 'Guests stay at their host’s table. Move the host instead.' };
    const sizeOf = (x: EventSeat) => 1 + (e.attendees.find((y) => y.residentId === x.residentId)?.guests ?? 0);
    const other = data.residents.find((y) => y.id === occ.residentId);
    return {
      error: `Only parties of the same size can swap tables (${shortName(r)}’s is ${sizeOf(cur)}, ${other ? shortName(other) : 'theirs'}’s is ${sizeOf(occ)}). Drop on an empty seat or on the table instead.`,
    };
  }

  // A guest: anywhere at their host's table.
  if (who.guest > 0) {
    const host = party.find((s) => s.guest === 0);
    if (host && host.tableId !== t.id) {
      const ht = data.tables.find((x) => x.id === host.tableId);
      return { error: `Guests sit at their host’s table${ht ? ` (${tableLabel(data, e, ht)})` : ''}.` };
    }
    return { ops: [...(cur ? [del2(cur)] : []), put('event_seat', seatRow(e.id, target, who))] };
  }

  // The resident, within the same table: just them.
  if (cur && cur.tableId === t.id) return { ops: [del2(cur), put('event_seat', seatRow(e.id, target, who))] };

  // The resident to another table: the whole party comes, guests beside them.
  const others = new Set(e.seats.filter((s) => s.tableId === t.id && s.residentId !== who.residentId && s.seat < n).map((s) => s.seat));
  const room = n - others.size;
  if (room < 1 + a.guests) return { error: `${label} has room for ${room}; ${shortName(r)}’s party is ${1 + a.guests}.` };
  const taken = new Set([...others, target.seat]);
  const dist = (x: number, y: number) => Math.min((x - y + n) % n, (y - x + n) % n);
  const placed: { seat: number; guest: number }[] = [{ seat: target.seat, guest: 0 }];
  for (let g = 1; g <= a.guests; g++) {
    let best = -1;
    for (let s2 = 0; s2 < n; s2++) if (!taken.has(s2) && (best < 0 || dist(s2, target.seat) < dist(best, target.seat))) best = s2;
    taken.add(best);
    placed.push({ seat: best, guest: g });
  }
  return { ops: [...party.map(del2), ...placed.map((p) => put('event_seat', seatRow(e.id, { tableId: t.id, seat: p.seat }, { residentId: who.residentId, guest: p.guest })))] };
}

/**
 * Dropped on a table rather than a seat: a resident's party takes free seats side by side; a guest
 * takes the free seat nearest their host.
 */
export function planMoveToTable(data: AppData, e: DiningEvent, who: Who, tableId: string): { ops: Op[] } | { error: string } {
  const t = eventTables(data, e).find((x) => x.id === tableId);
  if (!t) return { error: 'That table isn’t open for this event.' };
  const n = seatCount(t.shape);
  const party = e.seats.filter((s) => s.residentId === who.residentId);
  const host = party.find((s) => s.guest === 0);
  if (who.guest === 0 && host?.tableId === tableId) return { ops: [] };
  const taken = new Set(e.seats.filter((s) => s.tableId === tableId && s.residentId !== who.residentId && s.seat < n).map((s) => s.seat));
  const free = Array.from({ length: n }, (_, i) => i).filter((i) => !taken.has(i));
  if (!free.length) return { error: `${tableLabel(data, e, t)} is full.` };
  const dist = (x: number, y: number) => Math.min((x - y + n) % n, (y - x + n) % n);
  if (who.guest > 0) {
    const from = host && host.tableId === tableId ? host.seat : free[0]!;
    return planMove(data, e, who, { tableId, seat: [...free].sort((a, b) => dist(a, from) - dist(b, from))[0]! });
  }
  // The start of the longest run of free seats, so the party sits together.
  const len = (start: number) => {
    let k = 0;
    while (k < n && !taken.has((start + k) % n)) k++;
    return k;
  };
  const start = [...free].sort((a, b) => len(b) - len(a) || a - b)[0]!;
  return planMove(data, e, who, { tableId, seat: start });
}

export const moveToTable =
  (eventId: string, who: Who, tableId: string) =>
  (data: AppData): Op[] => {
    const res = planMoveToTable(data, event(data, eventId), who, tableId);
    if ('error' in res) throw new Error(res.error);
    return res.ops;
  };

export const moveSeat =
  (eventId: string, who: Who, target: Pick<EventSeat, 'tableId' | 'seat'>) =>
  (data: AppData): Op[] => {
    const res = planMove(data, event(data, eventId), who, target);
    if ('error' in res) throw new Error(res.error);
    return res.ops;
  };

/** Pins or unpins a whole party. */
export const setPinned =
  (eventId: string, residentId: string, pinned: boolean) =>
  (data: AppData): Op[] =>
    event(data, eventId)
      .seats.filter((s) => s.residentId === residentId && s.pinned !== pinned)
      .map((s) => patch('event_seat', seatKey(eventId, s), { pinned: pinned ? 1 : 0 }));

export const unpinAll =
  (eventId: string) =>
  (data: AppData): Op[] =>
    event(data, eventId)
      .seats.filter((s) => s.pinned)
      .map((s) => patch('event_seat', seatKey(eventId, s), { pinned: 0 }));

/** Takes a resident and their guests off their seats, or just one guest. */
export const unseat =
  (eventId: string, who: Who) =>
  (data: AppData): Op[] => {
    const e = event(data, eventId);
    return e.seats.filter((s) => s.residentId === who.residentId && (who.guest === 0 || s.guest === who.guest)).map((s) => del('event_seat', seatKey(eventId, s)));
  };

export interface Change {
  residentId: string;
  tableId: string;
  /** "Rose T. (+2)" */
  name: string;
  /** "Table 2 → Table 1", "added · Table 4", "no usual seat · Table 3" */
  text: string;
}

/** Everyone seated somewhere other than their everyday table, as it stands now (moves by hand included). */
export function eventChanges(data: AppData, e: DiningEvent): Change[] {
  const tables = new Map(eventTables(data, e).map((t) => [t.id, t]));
  const all = new Map(data.tables.map((t) => [t.id, t]));
  const out: (Change & { sort: string })[] = [];
  for (const p of eventParties(data, e)) {
    const s = e.seats.find((x) => x.residentId === p.residentId && x.guest === 0);
    const t = s && tables.get(s.tableId);
    if (!t || s.tableId === p.usualTable) continue;
    const to = tableLabel(data, e, t);
    const usual = data.seating.find((x) => x.siteId === e.siteId && x.meal === e.meal && x.residentId === p.residentId);
    const from = usual && all.get(usual.tableId);
    // Within one section, "Table 4 → Table 3 (Section 1)" says it once.
    const fromLabel = from && (from.section === t.section ? `Table ${from.number}` : tableLabel(data, e, from));
    const text = p.added ? `added · ${to}` : fromLabel ? `${fromLabel} → ${to}` : `no usual seat · ${to}`;
    out.push({ residentId: p.residentId, tableId: t.id, name: p.guests ? `${p.name} (+${p.guests})` : p.name, text, sort: `${t.section}|${String(t.number).padStart(4, '0')}|${p.name}` });
  }
  return out.sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort: _sort, ...c }) => c);
}

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
