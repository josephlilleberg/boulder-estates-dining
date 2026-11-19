import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import { seedTestDb } from '../test/seed';
import { addToEvent, createEvent, deleteEvent, editEvent, eventTotals, guestList, removeFromEvent, setAttendeeStatus, setGuests } from './eventActions';
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
