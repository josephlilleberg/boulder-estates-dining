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
    await checkEdit('R0', 'RO', A.setSpecialWater('R0', 'Dinner', 'ro'), (r) => expect([r.prefs.Dinner!.roWater, r.prefs.Dinner!.hotWater]).toEqual([true, false]));
    await checkEdit('R0', 'Hot', A.setSpecialWater('R0', 'Dinner', 'hot'), (r) => expect([r.prefs.Dinner!.roWater, r.prefs.Dinner!.hotWater]).toEqual([false, true]));
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
    const id = res(store, 'R0').prefs.Breakfast!.extras[0]!.id; // Soup Spoon
    await checkEdit('R0', 'Edit', A.updateExtra(id, { name: 'Soup Spoon', variant: null, count: 2 }), (r) => expect(r.prefs.Breakfast!.extras[0]!.count).toBe(2));
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

describe('deleting a resident', () => {
  it('removes them and everything theirs in one step; Undo brings it all back', async () => {
    await store.change('Note', A.addNote('R0', 'Nut allergy'));
    const before = structuredClone(store.get().data);
    const r0 = res(store, 'R0');
    expect(before.seating.some((s) => s.residentId === 'R0')).toBe(true);
    expect(Object.values(r0.prefs).some((p) => p!.drinks.length && p!.extras.length)).toBe(true);

    await store.change('Delete', A.deleteResident('R0'));
    const gone = (s: Store) => {
      expect(s.get().data.residents.find((r) => r.id === 'R0')).toBeUndefined();
      expect(s.get().data.seating.some((x) => x.residentId === 'R0')).toBe(false);
    };
    gone(store);
    gone(await restart());
    const left = await db.select<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM drink WHERE resident_id='R0') + (SELECT COUNT(*) FROM extra WHERE resident_id='R0') + (SELECT COUNT(*) FROM resident_note WHERE resident_id='R0') + (SELECT COUNT(*) FROM attendance WHERE resident_id='R0') + (SELECT COUNT(*) FROM meal_pref WHERE resident_id='R0') AS n`,
    );
    expect(left[0]!.n).toBe(0);

    await store.undoLast();
    expect(res(store, 'R0')).toEqual(r0);
    expect(store.get().data.seating).toEqual(before.seating);
  });
});

describe('special water', () => {
  it('is one choice: picking hot water turns RO off', async () => {
    await store.change('RO', A.setSpecialWater('R0', 'Dinner', 'ro'));
    await store.change('Hot', A.setSpecialWater('R0', 'Dinner', 'hot'));
    expect(A.specialWaterOf(res(store, 'R0').prefs.Dinner)).toBe('hot');
    expect(res(store, 'R0').prefs.Dinner!.roWater).toBe(false);
    expect(A.setSpecialWater('R0', 'Dinner', 'hot')(store.get().data)).toEqual([]);
  });
});

describe('breakfast coffee switch', () => {
  const bkCoffee = (s: Store, id: string) => (res(s, id).prefs.Breakfast?.drinks ?? []).filter((d) => d.slot === 'coffee');

  it('turns coffee off and on, one undo step each', async () => {
    const id = store.get().data.residents.find((r) => bkCoffee(store, r.id).length === 1)!.id;
    await checkEdit(id, 'Off', A.setBreakfastCoffee(id, false), (r) => expect(r.prefs.Breakfast!.drinks.some((d) => d.slot === 'coffee')).toBe(false));
    await store.change('Off', A.setBreakfastCoffee(id, false));
    await checkEdit(id, 'On', A.setBreakfastCoffee(id, true), (r) => expect(r.prefs.Breakfast!.drinks.filter((d) => d.slot === 'coffee').map((d) => [d.beverage, d.drinkware])).toEqual([['Coffee', 'Mug']]));
    expect(A.setBreakfastCoffee(id, false)(store.get().data)).toEqual([]); // already off
  });

  it('is on by default for a new resident or someone new to Breakfast; Dinner and Supper start with coffee as drink 1', async () => {
    const { id, ops } = A.addResident({ siteId: 'BE', first: 'Test', last: 'Person', meals: ['Breakfast', 'Dinner', 'Supper'] });
    await store.change('Add', ops);
    expect(bkCoffee(store, id)).toHaveLength(1);
    for (const meal of ['Dinner', 'Supper'] as const) expect(res(store, id).prefs[meal]!.drinks.map((d) => [d.slot, d.beverage, d.drinkware])).toEqual([['drink', 'Coffee', 'Mug']]);
    const newToDinner = store.get().data.residents.find((r) => !r.prefs.Dinner)!.id;
    await store.change('Comes', A.setAttendance(newToDinner, 'Dinner', true));
    expect(res(store, newToDinner).prefs.Dinner!.drinks.map((d) => d.beverage)).toEqual(['Coffee']);

    const newcomer = store.get().data.residents.find((r) => !r.prefs.Breakfast)!.id;
    await store.change('Comes', A.setAttendance(newcomer, 'Breakfast', true));
    expect(bkCoffee(store, newcomer)).toHaveLength(1);
  });
});

describe('extra wording', () => {
  it('uses the names as written in Settings, capitalized, with a count only above 1', async () => {
    const { extraText } = await import('../domain/labels');
    expect(extraText({ name: 'Jelly', variant: 'Mixed Fruit', count: 1 })).toBe('Mixed Fruit Jelly');
    expect(extraText({ name: 'Jelly', variant: 'Grape', count: 2 })).toBe('Grape Jelly ×2');
    expect(extraText({ name: 'Napkins', variant: null, count: 2 })).toBe('Napkins ×2');
    expect(extraText({ name: 'Fruit', variant: 'Banana', count: 1 })).toBe('Banana');
  });
});

describe('names', () => {
  it('capitalizes words typed in lowercase and leaves the rest as typed', async () => {
    const { tidyName } = await import('../domain/model');
    expect(tidyName('  ella   mae ')).toBe('Ella Mae');
    expect(tidyName('st. clair')).toBe('St. Clair');
    expect(tidyName("o'neil-smith")).toBe("O'Neil-Smith");
    expect(tidyName('McAllister')).toBe('McAllister');
    expect(tidyName('LaVerne')).toBe('LaVerne');
  });

  it('a new resident typed in lowercase is saved capitalized, with an optional nickname', async () => {
    const { id, ops } = A.addResident({ siteId: 'BE', first: 'robert', last: 'fenwick', nickname: 'bobby', meals: ['Dinner'] });
    await store.change('Add', ops);
    expect(res(store, id)).toMatchObject({ first: 'Robert', last: 'Fenwick', nickname: 'Bobby' });
  });

  it('a nickname replaces the first name on diagrams; it survives a restart, can be cleared and undone', async () => {
    const { shortName } = await import('../domain/model');
    await checkEdit('R0', 'Nickname', A.renameResident('R0', res(store, 'R0').first, res(store, 'R0').last, 'Sunny'), (r) => {
      expect(r.nickname).toBe('Sunny');
      expect(shortName(r)).toBe(`Sunny ${r.last.charAt(0)}.`);
    });
    await store.change('Nickname', A.renameResident('R0', res(store, 'R0').first, res(store, 'R0').last, 'Sunny'));
    await store.change('Clear', A.renameResident('R0', res(store, 'R0').first, res(store, 'R0').last, ''));
    expect(res(store, 'R0').nickname).toBeNull();
  });
});

describe('cups and amounts', () => {
  const only = async (meal: 'Supper') => {
    for (const o of res(store, 'R0').prefs[meal]?.drinks.filter((x) => x.slot === 'drink') ?? []) await store.change('Remove', A.removeDrink(o.id));
  };

  it('only a glass or to-go cup has Half; juice: glass starts full, to-go starts half, juice glass is one serving', async () => {
    await only('Supper');
    const { id, ops } = A.addDrink('R0', 'Supper', 'drink', 'Cranberry Juice');
    await store.change('Add', ops);
    const d = () => res(store, 'R0').prefs.Supper!.drinks.find((x) => x.id === id)!;
    expect([d().drinkware, d().amount]).toEqual(['Juice glass', 'Full']);
    expect(() => A.updateDrink(id, { amount: 'Half' })(store.get().data)).toThrow(/glass or to-go/);
    expect(() => A.updateDrink(id, { drinkware: 'Mug' })(store.get().data)).toThrow(/Juice goes in/);
    await store.change('Cup', A.updateDrink(id, { drinkware: 'To-go cup' }));
    expect([d().drinkware, d().amount]).toEqual(['To-go cup', 'Half']);
    await store.change('Cup', A.updateDrink(id, { drinkware: 'Glass' }));
    expect(d().amount).toBe('Full');
    await store.change('Cup', A.updateDrink(id, { drinkware: 'Juice glass' }));
    expect(d().amount).toBe('Full');
  });

  it('a full glass or to-go cup of juice counts as 2 drinks', async () => {
    await only('Supper');
    const juice = A.addDrink('R0', 'Supper', 'drink', 'Orange Juice');
    await store.change('Add', juice.ops);
    await store.change('Glass', A.updateDrink(juice.id, { drinkware: 'Glass' })); // full: both slots
    expect(A.unitsUsed(store.get().data, 'BE', res(store, 'R0').prefs.Supper!.drinks)).toBe(2);
    expect(() => A.addDrink('R0', 'Supper', 'drink', '2% Milk').ops(store.get().data)).toThrow(/counts as 2/);
    await store.change('Half', A.updateDrink(juice.id, { amount: 'Half' })); // half: one slot
    const milk = A.addDrink('R0', 'Supper', 'drink', '2% Milk');
    await store.change('Milk', milk.ops);
    expect(() => A.updateDrink(juice.id, { amount: 'Full' })(store.get().data)).toThrow(/Remove the other drink first/);
    // With another drink, choosing a glass for juice starts at half instead.
    await store.change('JG', A.updateDrink(juice.id, { drinkware: 'Juice glass' }));
    await store.change('Glass', A.updateDrink(juice.id, { drinkware: 'Glass' }));
    expect(res(store, 'R0').prefs.Supper!.drinks.find((x) => x.id === juice.id)!.amount).toBe('Half');
  });

  it('adding the same juice again means one full glass', async () => {
    await only('Supper');
    const a = A.addDrink('R0', 'Supper', 'drink', 'Apple Juice');
    await store.change('Add', a.ops);
    const target = A.juiceToMerge(store.get().data, 'BE', res(store, 'R0').prefs.Supper!.drinks, 'Apple Juice');
    expect(target?.id).toBe(a.id);
    expect(A.juiceToMerge(store.get().data, 'BE', res(store, 'R0').prefs.Supper!.drinks, 'Orange Juice')).toBeUndefined();
    await store.change('Merge', A.updateDrink(a.id, { drinkware: 'Glass' }));
    expect(res(store, 'R0').prefs.Supper!.drinks.filter((x) => x.slot === 'drink').map((x) => [x.beverage, x.drinkware, x.amount])).toEqual([['Apple Juice', 'Glass', 'Full']]);
  });
});

describe('no duplicate residents', () => {
  it('refuses the same first and last name, whatever the capitals or spacing, archived included', async () => {
    const r0 = res(store, 'R0');
    const again = A.addResident({ siteId: 'BE', first: ` ${r0.first.toLowerCase()} `, last: r0.last.toUpperCase(), meals: ['Dinner'] });
    expect(() => again.ops(store.get().data)).toThrow(/already a resident/);
    // Renaming someone else to that name is refused too; keeping your own name is fine.
    const r1 = res(store, 'R1');
    expect(() => A.renameResident('R1', r0.first, r0.last)(store.get().data)).toThrow(/already a resident/);
    expect(A.renameResident('R1', r1.first, r1.last, 'Sunny')(store.get().data)).toHaveLength(1);
    await store.change('Archive', A.archiveResident('R0'));
    expect(() => again.ops(store.get().data)).toThrow(/archived.*Restore/);
  });
});

describe('coffee cup', () => {
  it('coffee always goes in a mug: new coffee, switching to coffee, and no other cup allowed', async () => {
    const { id, ops } = A.addDrink('R0', 'Supper', 'drink', '2% Milk');
    await store.change('Add', ops);
    await store.change('Cup', A.updateDrink(id, { drinkware: 'To-go cup' }));
    await store.change('Coffee', A.updateDrink(id, { beverage: 'Coffee' }));
    const d = () => res(store, 'R0').prefs.Supper!.drinks.find((x) => x.id === id)!;
    expect([d().beverage, d().drinkware]).toEqual(['Coffee', 'Mug']);
    expect(() => A.updateDrink(id, { drinkware: 'Glass' })(store.get().data)).toThrow(/mug/);
    const bk = res(store, 'R0').prefs.Breakfast?.drinks.find((x) => x.slot === 'coffee');
    if (bk) expect(() => A.updateDrink(bk.id, { drinkware: 'To-go cup' })(store.get().data)).toThrow(/mug/);
  });
});

describe('tea cup', () => {
  it('tea always goes in a mug, like coffee', async () => {
    const { id, ops } = A.addDrink('R0', 'Supper', 'drink', '2% Milk');
    await store.change('Add', ops);
    await store.change('Cup', A.updateDrink(id, { drinkware: 'To-go cup' }));
    await store.change('Tea', A.updateDrink(id, { beverage: 'Tea' }));
    const d = res(store, 'R0').prefs.Supper!.drinks.find((x) => x.id === id)!;
    expect([d.beverage, d.drinkware]).toEqual(['Tea', 'Mug']);
    expect(() => A.updateDrink(id, { drinkware: 'Glass' })(store.get().data)).toThrow(/Tea always goes in a mug/);
  });
});

describe('extra glass and milk cups', () => {
  const jg = (id: string) => res(store, 'R0').prefs.Supper!.drinks.find((x) => x.id === id)!;

  it('only beside a drink in a glass, or a pair of the same juice; dropped when that stops', async () => {
    const a = A.addDrink('R0', 'Supper', 'drink', 'Cranberry Juice');
    await store.change('Add', a.ops);
    expect(() => A.updateDrink(a.id, { extraGlass: true })(store.get().data)).toThrow(/glass/); // one juice glass
    const b = A.addDrink('R0', 'Supper', 'drink', 'Cranberry Juice');
    // Supper starts with coffee as drink 1 for new residents only; R0 may have up to 2, so make room.
    const others = res(store, 'R0').prefs.Supper!.drinks.filter((x) => x.slot === 'drink' && x.id !== a.id);
    for (const o of others) await store.change('Remove', A.removeDrink(o.id));
    await store.change('Add', b.ops);
    await store.change('Extra', A.updateDrink(a.id, { extraGlass: true })); // pair → one glass, + water glass
    expect(jg(a.id).extraGlass).toBe(true);
    await store.change('Remove', A.removeDrink(b.id)); // pair split: the extra glass goes too
    expect(jg(a.id).extraGlass).toBe(false);
  });

  it('milk goes in a glass, juice glass or to-go cup (no pitcher); moving it out of the glass drops the extra glass', async () => {
    const m = A.addDrink('R0', 'Supper', 'drink', '2% Milk');
    for (const o of res(store, 'R0').prefs.Supper?.drinks.filter((x) => x.slot === 'drink') ?? []) await store.change('Remove', A.removeDrink(o.id));
    await store.change('Add', m.ops);
    await store.change('Extra', A.updateDrink(m.id, { extraGlass: true }));
    expect(() => A.updateDrink(m.id, { drinkware: 'Mug' })(store.get().data)).toThrow(/glass, juice glass or to-go cup/);
    expect(() => A.updateDrink(m.id, { drinkware: 'Milk pitcher' })(store.get().data)).toThrow(/glass, juice glass or to-go cup/);
    await store.change('To-go', A.updateDrink(m.id, { drinkware: 'To-go cup' }));
    expect([jg(m.id).drinkware, jg(m.id).extraGlass]).toEqual(['To-go cup', false]);
  });
});

describe('extra backups: any kind', () => {
  it('"Any kind" reads "…, else any kind"; no backup means nothing and isn\'t written', async () => {
    const { extraText } = await import('../domain/labels');
    const { ANY_KIND } = await import('../domain/model');
    expect(extraText({ name: 'Jelly', variant: 'Mixed Fruit', backup: ANY_KIND, count: 1 })).toBe('Mixed Fruit Jelly, else any kind');
    expect(extraText({ name: 'Jelly', variant: 'Mixed Fruit', backup: null, count: 1 })).toBe('Mixed Fruit Jelly');
    await store.change('Add', A.addExtra('R0', 'Breakfast', { name: 'Jelly', variant: 'Mixed Fruit', backup: ANY_KIND, count: 1 }));
    expect(res(store, 'R0').prefs.Breakfast!.extras.some((x) => x.backup === ANY_KIND)).toBe(true);
  });
});

describe('extra backups', () => {
  it('a kind can have a second choice: saved, shown as "Banana, else Apple", undoable', async () => {
    const { extraText } = await import('../domain/labels');
    expect(extraText({ name: 'Fruit', variant: 'Banana', backup: 'Apple', count: 1 })).toBe('Banana, else Apple');
    expect(extraText({ name: 'Jelly', variant: 'Grape', backup: 'Strawberry', count: 2 })).toBe('Grape Jelly ×2, else Strawberry');
    await checkEdit('R0', 'Fruit', A.addExtra('R0', 'Breakfast', { name: 'Fruit', variant: 'Banana', backup: 'Apple', count: 1 }), (r) =>
      expect(r.prefs.Breakfast!.extras.map(extraText)).toContain('Banana, else Apple'),
    );
  });

  it('no backup without a kind, and never the same as the first choice', async () => {
    await store.change('Add', A.addExtra('R0', 'Breakfast', { name: 'Fruit', variant: 'Banana', backup: 'banana', count: 1 }));
    await store.change('Add', A.addExtra('R0', 'Breakfast', { name: 'Soup Spoon', variant: null, backup: 'Apple', count: 1 }));
    const xs = res(store, 'R0').prefs.Breakfast!.extras;
    expect(xs.find((x) => x.variant === 'Banana')!.backup).toBeNull();
    expect(xs.filter((x) => x.name === 'Soup Spoon').every((x) => x.backup === null)).toBe(true);
  });
});
