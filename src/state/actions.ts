import type { AppData } from '../db/repo';
import type { MealName, SiteId } from '../domain/sites';
import { seatCount } from '../domain/tables';
import { del, put, type Op } from './ops';

// Domain rules as pure functions: (current data) → row operations. The store
// applies them atomically with undo. Screens call these; they never build ops.

export interface SeatRef {
  siteId: SiteId;
  meal: MealName;
  tableId: string;
  seat: number;
}

const seatKey = (s: SeatRef) => ({ site_id: s.siteId, meal: s.meal, table_id: s.tableId, seat: s.seat });
const seatRow = (s: SeatRef, residentId: string) => ({ ...seatKey(s), resident_id: residentId });

function occupant(data: AppData, s: SeatRef) {
  return data.seating.find((x) => x.siteId === s.siteId && x.meal === s.meal && x.tableId === s.tableId && x.seat === s.seat);
}

function seatOf(data: AppData, siteId: SiteId, meal: MealName, residentId: string) {
  return data.seating.find((x) => x.siteId === siteId && x.meal === meal && x.residentId === residentId);
}

function assertSeatExists(data: AppData, s: SeatRef) {
  const t = data.tables.find((x) => x.id === s.tableId);
  if (!t || s.seat < 0 || s.seat >= seatCount(t.shape)) throw new Error(`No seat ${s.seat} at table ${s.tableId}`);
  const opening = data.sites.find((x) => x.id === s.siteId)?.meals.find((m) => m.meal === s.meal);
  if (!opening?.sections.some((o) => o.section === t.section)) throw new Error(`Section ${t.section} isn't open at ${s.meal}`);
}

/** Turn "comes to <meal>" on or off. Off also clears their seat at that meal. */
export const setAttendance = (residentId: string, meal: MealName, comes: boolean) => (data: AppData): Op[] => {
  const r = data.residents.find((x) => x.id === residentId);
  if (!r) throw new Error(`Unknown resident ${residentId}`);
  if (r.attends.includes(meal) === comes) return [];
  if (comes) {
    const ops: Op[] = [put('attendance', { resident_id: residentId, meal })];
    // Keep existing prefs if they came before; otherwise start with defaults.
    if (!r.prefs[meal]) ops.push(put('meal_pref', { resident_id: residentId, meal, ro_water: 0, hot_water: 0, portion: 'Full' }));
    return ops;
  }
  const seat = seatOf(data, r.siteId, meal, residentId);
  return [
    ...(seat ? [del('seating', seatKey(seat))] : []), // seat first: the DB refuses the reverse order
    del('attendance', { resident_id: residentId, meal }),
  ];
};

/**
 * Put a resident in a seat. If they were seated elsewhere at this meal they move;
 * if the seat was taken, the two swap (the other person goes to the mover's old
 * seat, or is unseated if the mover wasn't seated).
 */
export const seatResident = (target: SeatRef, residentId: string) => (data: AppData): Op[] => {
  assertSeatExists(data, target);
  const r = data.residents.find((x) => x.id === residentId);
  if (!r) throw new Error(`Unknown resident ${residentId}`);
  if (r.archived) throw new Error(`${r.first} ${r.last} is archived`);
  if (!r.attends.includes(target.meal)) throw new Error(`${r.first} ${r.last} doesn't come to ${target.meal}`);

  const from = seatOf(data, target.siteId, target.meal, residentId);
  const other = occupant(data, target);
  if (other?.residentId === residentId) return [];

  // Delete before insert so the one-seat-per-resident constraint never trips mid-change.
  const ops: Op[] = [];
  if (from) ops.push(del('seating', seatKey(from)));
  if (other) ops.push(del('seating', seatKey(target)));
  ops.push(put('seating', seatRow(target, residentId)));
  if (other && from) ops.push(put('seating', seatRow(from, other.residentId)));
  return ops;
};

export const clearSeat = (s: SeatRef) => (data: AppData): Op[] => (occupant(data, s) ? [del('seating', seatKey(s))] : []);
