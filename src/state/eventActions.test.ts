import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import { seedTestDb } from '../test/seed';
import { addToEvent, arrangeSeats, createEvent, eventTables, moveSeat, planMove, setPinned, unpinAll, unseat, deleteEvent, editEvent, eventTotals, guestList, removeFromEvent, seatingState, setAttendeeStatus, setGuests } from './eventActions';
import { addResident, deleteResident, setAttendance, setMealPlan } from './residentActions';
import { Store } from './store';

const SQL = await initSqlJs();
let store: Store;
const data = () => store.get().data;
const ev = (id: string) => data().events.find((e) => e.id === id)!;

beforeEach(async () => {
  const db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

async function thanksgiving() {
  const { id, ops } = createEvent({ siteId: 'BE', name: ' Thanksgiving  2026 ', date: '2026-11-26', meal: 'Dinner' });
  await store.change('New event', ops);
  return id;
}

describe('meal plan', () => {
  it('starts as everyone who comes, and is changed apart from attendance', async () => {
    const r = data().residents.find((x) => x.attends.includes('Dinner'))!;
    expect(r.onPlan).toEqual(r.attends);
    await store.change('off plan', setMealPlan(r.id, 'Dinner', false));
    const after = data().residents.find((x) => x.id === r.id)!;
    expect(after.onPlan).not.toContain('Dinner');
    expect(after.attends).toContain('Dinner');
    await store.undoLast();
    expect(data().residents.find((x) => x.id === r.id)!.onPlan).toContain('Dinner');
  });

  it('a new resident is on the plan for the meals they come to', async () => {
    const { id, ops } = addResident({ siteId: 'BE', first: 'Zed', last: 'Newman', meals: ['Dinner'] });
    await store.change('add', ops);
    expect(data().residents.find((x) => x.id === id)!.onPlan).toEqual(['Dinner']);
  });
});

describe('events', () => {
  it('starts the guest list from today’s Dinner regulars', async () => {
    const id = await thanksgiving();
    const e = ev(id);
    expect(e.name).toBe('Thanksgiving 2026');
    const regulars = data().residents.filter((r) => r.siteId === 'BE' && !r.archived && r.attends.includes('Dinner'));
    expect(e.attendees).toHaveLength(regulars.length);
    expect(e.attendees.every((a) => a.status === 'coming' && !a.added && a.guests === 0)).toBe(true);
  });

  it('is a snapshot: later attendance changes don’t change the list', async () => {
    const id = await thanksgiving();
    const r = data().residents.find((x) => x.attends.includes('Dinner'))!;
    await store.change('stop', setAttendance(r.id, 'Dinner', false));
    expect(ev(id).attendees.some((a) => a.residentId === r.id)).toBe(true);
  });

  it('cancels, adds, counts guests and totals', async () => {
    const id = await thanksgiving();
    const [a, b] = ev(id).attendees;
    const outsider = data().residents.find((r) => r.siteId === 'BE' && !r.attends.includes('Dinner'))!;
    await store.change('cancel', setAttendeeStatus(id, a!.residentId, 'cancelled'));
    await store.change('guests', setGuests(id, b!.residentId, 3));
    await store.change('add', addToEvent(id, outsider.id));
    const t = eventTotals(data(), ev(id));
    expect(t.cancelled).toBe(1);
    expect(t.guests).toBe(3);
    expect(t.people).toBe(t.residents + 3);
    expect(t.seats).toBeGreaterThan(0);
    const added = guestList(data(), ev(id)).find((x) => x.residentId === outsider.id)!;
    expect(added.added).toBe(true);
    expect(added.onPlan).toBe(false);
    await store.change('remove', removeFromEvent(id, outsider.id));
    expect(ev(id).attendees.some((x) => x.residentId === outsider.id)).toBe(false);
  });

  it('keeps guests between 0 and the maximum', async () => {
    const id = await thanksgiving();
    const r = ev(id).attendees[0]!.residentId;
    await store.change('g', setGuests(id, r, -2));
    expect(ev(id).attendees[0]!.guests).toBe(0);
    await store.change('g', setGuests(id, r, 99));
    expect(ev(id).attendees.find((a) => a.residentId === r)!.guests).toBe(20);
  });

  it('renames, deletes with undo, and deleting a resident takes them off events', async () => {
    const id = await thanksgiving();
    await store.change('edit', editEvent(id, 'Christmas', '2026-12-25'));
    expect(ev(id).name).toBe('Christmas');
    const r = ev(id).attendees[0]!.residentId;
    await store.change('del r', deleteResident(r));
    expect(ev(id).attendees.some((a) => a.residentId === r)).toBe(false);
    await store.change('del', deleteEvent(id));
    expect(data().events).toHaveLength(0);
    await store.undoLast();
    expect(ev(id).attendees.length).toBeGreaterThan(0);
  });
});

describe('event seating', () => {
  it('with no changes, everyone at a table still in use keeps their everyday Dinner seat', async () => {
    const id = await thanksgiving();
    await store.change('arrange', arrangeSeats(id));
    const e = ev(id);
    const everyday = data().seating.filter((s) => s.meal === 'Dinner');
    const used = new Set(e.seats.map((s) => s.tableId));
    // Half-empty tables merge, so no more tables than every day.
    expect(used.size).toBeLessThanOrEqual(new Set(everyday.map((s) => s.tableId)).size);
    for (const s of everyday.filter((x) => used.has(x.tableId) && e.seats.find((y) => y.residentId === x.residentId)?.tableId === x.tableId))
      expect(e.seats.find((x) => x.residentId === s.residentId)).toMatchObject({ tableId: s.tableId, seat: s.seat, guest: 0 });
    const st = seatingState(data(), e);
    expect(st.over.size).toBe(0);
    // Regulars without an everyday seat get one too.
    expect(st.unseated).toEqual([]);
  });

  it('guests are seated, and cancelling or fewer guests frees seats', async () => {
    const id = await thanksgiving();
    const host = data().seating.find((s) => s.meal === 'Dinner')!.residentId;
    await store.change('g', setGuests(id, host, 2));
    await store.change('arrange', arrangeSeats(id));
    const mine = () => ev(id).seats.filter((s) => s.residentId === host);
    expect(
      mine()
        .map((s) => s.guest)
        .sort(),
    ).toEqual([0, 1, 2]);
    expect(new Set(mine().map((s) => s.tableId)).size).toBe(1);
    await store.change('g', setGuests(id, host, 1));
    expect(
      mine()
        .map((s) => s.guest)
        .sort(),
    ).toEqual([0, 1]);
    await store.change('c', setAttendeeStatus(id, host, 'cancelled'));
    expect(mine()).toEqual([]);
    await store.undoLast();
    expect(mine()).toHaveLength(2);
  });
});

describe('moving by hand', () => {
  async function arranged() {
    const id = await thanksgiving();
    await store.change('arrange', arrangeSeats(id));
    return id;
  }
  const seatOf = (id: string, rid: string, guest = 0) => ev(id).seats.find((s) => s.residentId === rid && s.guest === guest);
  const emptySeat = (id: string, minFree = 1) => {
    const e = ev(id);
    for (const t of eventTables(data(), e)) {
      const n = t.shape === 'round' ? 4 : 6;
      const used = new Set(e.seats.filter((s) => s.tableId === t.id).map((s) => s.seat));
      if (n - used.size >= minFree) for (let k = 0; k < n; k++) if (!used.has(k)) return { tableId: t.id, seat: k };
    }
    throw new Error('no room');
  };

  it('moving someone pins them, and Arrange again leaves them there', async () => {
    const id = await arranged();
    const rid = ev(id).seats[0]!.residentId;
    const to = emptySeat(id);
    await store.change('move', moveSeat(id, { residentId: rid, guest: 0 }, to));
    expect(seatOf(id, rid)).toMatchObject({ ...to, pinned: true });
    await store.change('again', arrangeSeats(id));
    expect(seatOf(id, rid)).toMatchObject(to);
    await store.change('unpin', setPinned(id, rid, false));
    expect(seatOf(id, rid)!.pinned).toBe(false);
  });

  it('a resident brings their guests; the table must have room', async () => {
    const id = await thanksgiving();
    const rid = data().seating.find((s) => s.meal === 'Dinner')!.residentId;
    await store.change('g', setGuests(id, rid, 2));
    await store.change('arrange', arrangeSeats(id));
    const to = emptySeat(id, 3);
    await store.change('move', moveSeat(id, { residentId: rid, guest: 0 }, to));
    const mine = ev(id).seats.filter((s) => s.residentId === rid);
    expect(mine).toHaveLength(3);
    expect(mine.every((s) => s.tableId === to.tableId && s.pinned)).toBe(true);
    // A guest can't leave their host's table.
    const other = eventTables(data(), ev(id)).find((t) => t.id !== to.tableId)!;
    const res = planMove(data(), ev(id), { residentId: rid, guest: 1 }, { tableId: other.id, seat: 0 });
    expect(res).toHaveProperty('error');
  });

  it('two people at the same table swap; unseat and unpin all', async () => {
    const id = await arranged();
    const e = ev(id);
    const t = e.seats.find((x) => e.seats.filter((y) => y.tableId === x.tableId).length >= 2)!.tableId;
    const [a, b] = e.seats.filter((s) => s.tableId === t);
    await store.change('swap', moveSeat(id, { residentId: a!.residentId, guest: 0 }, { tableId: t, seat: b!.seat }));
    expect(seatOf(id, a!.residentId)!.seat).toBe(b!.seat);
    expect(seatOf(id, b!.residentId)!.seat).toBe(a!.seat);
    await store.change('off', unseat(id, { residentId: a!.residentId, guest: 0 }));
    expect(seatOf(id, a!.residentId)).toBeUndefined();
    await store.change('unpin', unpinAll(id));
    expect(ev(id).seats.some((s) => s.pinned)).toBe(false);
  });
});
