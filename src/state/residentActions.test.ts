import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import type { AppData } from '../db/repo';
import { sqljsDb } from '../db/sqljsDb';
import type { Op } from './ops';
import * as A from './residentActions';
import { Store } from './store';

const SQL = await initSqlJs();

let db: ReturnType<typeof sqljsDb>;
let store: Store;

beforeEach(async () => {
  db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

/** Simulates quitting and relaunching: the file's bytes reopened in a fresh store. */
async function restart(): Promise<Store> {
  const reopened = sqljsDb(SQL, db.raw.export());
  await migrate(reopened);
  return Store.open(reopened);
}

const res = (s: Store, id: string) => s.get().data.residents.find((r) => r.id === id)!;

/**
 * Step 3 check, for one edit: it survives a restart, and Undo returns the
 * resident to exactly how they were.
 */
async function checkEdit(id: string, label: string, ops: (d: AppData) => Op[], expectChanged: (after: ReturnType<typeof res>) => void) {
  const before = structuredClone(res(store, id));
  await store.change(label, ops);
  expectChanged(res(store, id));
  expectChanged(res(await restart(), id));
  await store.undoLast();
  expect(res(store, id)).toEqual(before);
}

describe('every resident edit survives a restart and can be undone', () => {
  it('chair', () => checkEdit('R0', 'Chair', A.setChair('R0', 'no_arm'), (r) => expect(r.chair).toBe('no_arm')));

  it('rename', () =>
    checkEdit('R0', 'Rename', A.renameResident('R0', '  Jimmy ', 'Ashcombe'), (r) => expect([r.first, r.last]).toEqual(['Jimmy', 'Ashcombe'])));

  it('add and remove a note', async () => {
    await checkEdit('R0', 'Note', A.addNote('R0', 'Nut allergy'), (r) => expect(r.notes.map((n) => n.text)).toEqual(['Nut allergy']));
    await store.change('Note', A.addNote('R0', 'Nut allergy'));
    const noteId = res(store, 'R0').notes[0]!.id;
    await checkEdit('R0', 'Remove note', A.removeNote(noteId), (r) => expect(r.notes).toEqual([]));
  });

  it('attendance on', () => checkEdit('R0', 'Supper', A.setAttendance('R0', 'Supper', true), (r) => expect(r.attends).toContain('Supper')));

  it('RO water, hot water, portion', async () => {
    await checkEdit('R0', 'RO', A.setRoWater('R0', 'Dinner', true), (r) => expect(r.prefs.Dinner!.roWater).toBe(true));
    await checkEdit('R0', 'Hot', A.setHotWater('R0', 'Dinner', true), (r) => expect(r.prefs.Dinner!.hotWater).toBe(true));
    await checkEdit('R0', 'Half', A.setPortion('R0', 'Dinner', 'Half'), (r) => expect(r.prefs.Dinner!.portion).toBe('Half'));
  });

  it('add a drink with the right default cup', async () => {
    const { ops } = A.addDrink('R0', 'Dinner', 'drink', 'Orange Juice');
    await checkEdit('R0', 'Drink', ops, (r) => {
      const d = r.prefs.Dinner!.drinks.at(-1)!;
      expect([d.beverage, d.drinkware, d.amount]).toEqual(['Orange Juice', 'Juice glass', 'Full']);
    });
  });

  it('change a drink: new beverage resets its cup and tea; other fields edit in place', async () => {
    const drinkId = res(store, 'R0').prefs.Dinner!.drinks[0]!.id; // Coffee, Mug
    await checkEdit('R0', 'Tea', A.updateDrink(drinkId, { beverage: 'Tea' }), (r) => {
      const d = r.prefs.Dinner!.drinks[0]!;
      expect([d.beverage, d.drinkware, d.tea]).toEqual(['Tea', 'Mug', 'Chamomile']);
    });
    await checkEdit('R0', 'Creamer', A.updateDrink(drinkId, { creamer: true }), (r) => expect(r.prefs.Dinner!.drinks[0]!.creamer).toBe(true));
    await checkEdit('R0', 'Remove', A.removeDrink(drinkId), (r) => expect(r.prefs.Dinner!.drinks).toEqual([]));
  });

  it('extras: add, edit, remove', async () => {
    await checkEdit('R0', 'Extra', A.addExtra('R0', 'Dinner', { name: 'Napkins', variant: null, count: 2 }), (r) =>
      expect(r.prefs.Dinner!.extras.map((x) => [x.name, x.count])).toEqual([['Napkins', 2]]),
    );
    const id = res(store, 'R0').prefs.Breakfast!.extras[0]!.id; // Big Spoon
    await checkEdit('R0', 'Edit', A.updateExtra(id, { name: 'Big Spoon', variant: null, count: 2 }), (r) => expect(r.prefs.Breakfast!.extras[0]!.count).toBe(2));
    await checkEdit('R0', 'Remove', A.removeExtra(id), (r) => expect(r.prefs.Breakfast!.extras.map((x) => x.name)).not.toContain('Big Spoon'));
  });

  it('archive frees every seat; undo puts them back', async () => {
    const seats = store.get().data.seating.filter((s) => s.residentId === 'R0');
    expect(seats.length).toBe(2); // Dinner and Breakfast
    await checkEdit('R0', 'Archive', A.archiveResident('R0'), (r) => expect(r.archived).toBe(true));
    expect(store.get().data.seating.filter((s) => s.residentId === 'R0')).toEqual(seats);
  });
});

describe('resident rules', () => {
  it('adds a resident who comes to the chosen meals', async () => {
    const { id, ops } = A.addResident({ siteId: 'BE', first: 'Ada', last: 'Lovelace', meals: ['Dinner', 'Supper'] });
    await store.change('Add', ops);
    const r = res(store, id);
    expect(r.attends.sort()).toEqual(['Dinner', 'Supper']);
    expect(r.prefs.Supper!.portion).toBe('Full');
    expect(res(await restart(), id).first).toBe('Ada');
    await store.undoLast();
    expect(store.get().data.residents.find((x) => x.id === id)).toBeUndefined();
  });

  it('refuses blank names', async () => {
    await expect(store.change('Add', A.addResident({ siteId: 'BE', first: ' ', last: 'X', meals: [] }).ops)).rejects.toThrow(/name/);
  });

  it('caps drinks at 2 per meal; breakfast coffee does not count and is breakfast-only', async () => {
    // R0 Breakfast: 2 drinks + coffee already.
    await expect(store.change('Third', A.addDrink('R0', 'Breakfast', 'drink', 'Tea').ops)).rejects.toThrow(/Up to 2/);
    await expect(store.change('Coffee', A.addDrink('R0', 'Breakfast', 'coffee', 'Coffee').ops)).rejects.toThrow(/already/);
    await expect(store.change('Coffee', A.addDrink('R0', 'Dinner', 'coffee', 'Coffee').ops)).rejects.toThrow(/only for breakfast/);
  });

  it('turning attendance off keeps prefs, so turning it back on restores them', async () => {
    const drinks = res(store, 'R0').prefs.Breakfast!.drinks;
    await store.change('Off', A.setAttendance('R0', 'Breakfast', false));
    expect(res(store, 'R0').prefs.Breakfast!.drinks).toEqual(drinks);
  });
});
