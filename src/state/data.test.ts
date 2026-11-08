import initSqlJs from 'sql.js';
import { FIXTURE, seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { sqljsDb } from '../db/sqljsDb';
import type { Db } from '../db/types';
import { clearSeat, seatResident, setAttendance, type SeatRef } from './actions';
import { Store } from './store';

const L = FIXTURE;
const SQL = await initSqlJs();

async function fresh(): Promise<{ db: Db; store: Store }> {
  const db = sqljsDb(SQL);
  await seedTestDb(db);
  return { db, store: await Store.open(db) };
}

const seatsOf = (store: Store, meal: string) =>
  Object.fromEntries(
    store
      .get()
      .data.seating.filter((s) => s.meal === meal)
      .map((s) => [`${s.meal}|${s.tableId}|${s.seat}`, s.residentId]),
  );
const legacySeats = (meal: string) => Object.fromEntries(Object.entries(L.assign).filter(([k]) => k.startsWith(`${meal}|`)));

describe('import (Step 2 check)', () => {
  it('loads all 85 Boulder Estates residents', async () => {
    const { store } = await fresh();
    const be = store.get().data.residents.filter((r) => r.siteId === 'BE');
    expect(be).toHaveLength(85);
    expect(be.every((r) => !r.archived)).toBe(true);
  });

  it('Dinner and Breakfast seating match the old app exactly', async () => {
    const { store } = await fresh();
    expect(seatsOf(store, 'Dinner')).toEqual(legacySeats('Dinner'));
    expect(seatsOf(store, 'Breakfast')).toEqual(legacySeats('Breakfast'));
    expect(Object.keys(seatsOf(store, 'Dinner'))).toHaveLength(76);
    expect(Object.keys(seatsOf(store, 'Breakfast'))).toHaveLength(12);
  });

  it('carries over attendance, drinks, extras and flags', async () => {
    const { store } = await fresh();
    const jim = store.get().data.residents.find((r) => r.id === 'R0')!;
    expect(jim.attends.sort()).toEqual(['Breakfast', 'Dinner']);
    const bk = jim.prefs.Breakfast!;
    expect(bk.drinks.map((d) => [d.beverage, d.drinkware, d.slot])).toEqual([
      ['2% Milk', 'Glass', 'drink'],
      ['V8 Juice', 'Juice glass', 'drink'], // renamed from the old "V8"
      ['Coffee', 'Mug', 'coffee'],
    ]);
    expect(bk.drinks[0]!.extraGlass).toBe(true);
    expect(bk.extras.map((x) => [x.name, x.variant, x.count])).toContainEqual(['Jelly', 'Grape', 2]);
    const ardis = store.get().data.residents.find((r) => r.id === 'R32')!;
    expect(ardis.prefs.Dinner!.portion).toBe('Half');
  });

  it('seeds both sites, HSP disabled, with BE meal openings from the brief', async () => {
    const { store } = await fresh();
    const [be, hsp] = store.get().data.sites;
    expect(be!.meals.map((m) => [m.meal, m.sections.map((s) => `${s.section}:${s.label}`)])).toEqual([
      ['Breakfast', ['2:Section 1']],
      ['Dinner', ['1:Section 1', '2:Section 2', '3:Section 3']],
      ['Supper', ['2:Section 1']],
    ]);
    expect(be!.sections).toEqual([1, 2, 3]);
    expect(hsp!.enabled).toBe(false);
  });

  it('is idempotent: a second launch does not re-seed', async () => {
    const { db } = await fresh();
    expect((await migrate(db)).seeded).toBe(false);
    expect(await db.select(`SELECT COUNT(*) AS n FROM resident`)).toEqual([{ n: 85 }]);
  });
});

describe('rules and undo', () => {
  let store: Store;
  beforeEach(async () => {
    ({ store } = await fresh());
  });

  const dinner = (tableId: string, seat: number): SeatRef => ({ siteId: 'BE', meal: 'Dinner', tableId, seat });
  const at = (ref: SeatRef) =>
    store.get().data.seating.find((s) => s.meal === ref.meal && s.tableId === ref.tableId && s.seat === ref.seat)?.residentId;
  const seatOf = (rid: string, meal = 'Dinner') => store.get().data.seating.find((s) => s.meal === meal && s.residentId === rid);
  const someSeated = () => store.get().data.seating.find((s) => s.meal === 'Dinner')!;

  it('turning attendance off clears the seat; undo puts both back', async () => {
    const s = someSeated();
    await store.change('Stop coming to Dinner', setAttendance(s.residentId, 'Dinner', false));
    expect(seatOf(s.residentId)).toBeUndefined();
    expect(store.get().data.residents.find((r) => r.id === s.residentId)!.attends).not.toContain('Dinner');

    await store.undoLast();
    expect(seatOf(s.residentId)).toEqual(s);
    expect(store.get().data.residents.find((r) => r.id === s.residentId)!.attends).toContain('Dinner');
  });

  it('refuses to seat someone who does not come to the meal (app and database)', async () => {
    const r = store.get().data.residents.find((x) => !x.attends.includes('Supper'))!;
    const free: SeatRef = { siteId: 'BE', meal: 'Supper', tableId: 'be2-2', seat: 0 };
    await expect(store.change('Seat', seatResident(free, r.id))).rejects.toThrow(/doesn't come/);
    // Bypass the app rule: the trigger still says no.
    await expect(store.change('Seat', [{ kind: 'put', table: 'seating', row: { site_id: 'BE', meal: 'Supper', table_id: 'be2-2', seat: 0, resident_id: r.id } }])).rejects.toThrow(
      /does not come/,
    );
    expect(store.get().status).toBe('error');
    expect(store.get().data.seating.filter((s) => s.meal === 'Supper')).toHaveLength(0);
  });

  it('dropping on an occupied seat swaps; undo swaps back', async () => {
    const seated = store.get().data.seating.filter((s) => s.meal === 'Dinner');
    const a = seated[0]!;
    const b = seated.find((s) => s.tableId !== a.tableId)!;
    await store.change('Swap', seatResident(dinner(b.tableId, b.seat), a.residentId));
    expect(at(dinner(b.tableId, b.seat))).toBe(a.residentId);
    expect(at(dinner(a.tableId, a.seat))).toBe(b.residentId);

    await store.undoLast();
    expect(at(dinner(a.tableId, a.seat))).toBe(a.residentId);
    expect(at(dinner(b.tableId, b.seat))).toBe(b.residentId);
  });

  it('a resident sits in at most one seat per meal (moving vacates the old seat)', async () => {
    const a = someSeated();
    const taken = new Set(store.get().data.seating.filter((s) => s.meal === 'Dinner').map((s) => `${s.tableId}|${s.seat}`));
    const freeTable = store.get().data.tables.find((t) => t.section === 1 && [0, 1, 2, 3].some((i) => !taken.has(`${t.id}|${i}`)))!;
    const seat = [0, 1, 2, 3].find((i) => !taken.has(`${freeTable.id}|${i}`))!;
    await store.change('Move', seatResident(dinner(freeTable.id, seat), a.residentId));
    expect(store.get().data.seating.filter((s) => s.meal === 'Dinner' && s.residentId === a.residentId)).toHaveLength(1);
    expect(at(dinner(a.tableId, a.seat))).toBeUndefined();
  });

  it('undoes many steps in reverse order and keeps at least 50', async () => {
    const before = store.get().data.seating;
    const seated = before.filter((s) => s.meal === 'Dinner').slice(0, 60);
    for (const s of seated) await store.change('Clear', clearSeat(dinner(s.tableId, s.seat)));
    expect(store.get().data.seating.filter((s) => s.meal === 'Dinner')).toHaveLength(76 - 60);
    for (let i = 0; i < 60; i++) await store.undoLast();
    expect(store.get().data.seating).toEqual(before);
    expect(store.get().undoLabel).toBeNull();
  });

  it('a failed change leaves the database untouched and Undo history intact', async () => {
    const s = someSeated();
    await store.change('Clear', clearSeat(dinner(s.tableId, s.seat)));
    const snapshot = store.get().data;
    await expect(store.change('Bad', [{ kind: 'put', table: 'seating', row: { site_id: 'BE', meal: 'Dinner', table_id: 'nope', seat: 0, resident_id: s.residentId } }])).rejects.toThrow();
    expect(store.get().data.seating).toEqual(snapshot.seating);
    expect(store.get().undoLabel).toBe('Clear');
  });

  it('turning attendance back on restores their old drinks', async () => {
    const r = store.get().data.residents.find((x) => x.id === 'R0')!;
    const drinks = r.prefs.Breakfast!.drinks;
    await store.change('Off', setAttendance('R0', 'Breakfast', false));
    await store.change('On', setAttendance('R0', 'Breakfast', true));
    expect(store.get().data.residents.find((x) => x.id === 'R0')!.prefs.Breakfast!.drinks).toEqual(drinks);
  });
});
