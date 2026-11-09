import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { SCHEMA_VERSION } from '../db/schema';
import { sqljsDb } from '../db/sqljsDb';
import type { Db } from '../db/types';
import { DRINK_PALETTE, contrast, textColorFor } from '../domain/palette';
import { getOpening } from '../domain/sites';
import { setupChanges, serverPills } from '../sheets/model';
import { sheetsFor } from '../sheets/pages';
import { addDrink, updateDrink } from './residentActions';
import * as S from './settingsActions';
import { Store } from './store';

const SQL = await initSqlJs();
let db: Db;
let store: Store;

beforeEach(async () => {
  db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

const data = () => store.get().data;
const site = () => data().sites.find((s) => s.id === 'BE')!;
const bev = (name: string) => data().beverages.find((b) => b.siteId === 'BE' && b.name === name);
const someone = () => data().residents.find((r) => r.attends.includes('Dinner') && !r.archived && (r.prefs.Dinner?.drinks.filter((d) => d.slot === 'drink').length ?? 0) < 2)!;

describe('Drinks: a new drink works without code changes', () => {
  it('adds a drink, puts it on a resident, and both sheets print it', async () => {
    await store.change('Add', S.addBeverage('BE', { name: 'Grape Juice', shortLabel: 'Grape', kind: 'juice', color: '#F29BE0' }));
    expect(bev('Grape Juice')).toMatchObject({ kind: 'juice', shortLabel: 'Grape', color: '#F29BE0', textColor: '#000000', defaultDrinkware: 'Juice glass' });

    const r = someone();
    const { ops } = addDrink(r.id, 'Dinner', 'drink', 'Grape Juice');
    await store.change('Give', ops);
    const after = data().residents.find((x) => x.id === r.id)!;
    expect(serverPills(after, 'Dinner', data().beverages)).toContainEqual({ cap: 'Grape', bg: '#F29BE0', color: '#111827', half: false });
    expect(setupChanges(after, 'Dinner').map((c) => c.text)).toContain('+Juice');
  });

  it('refuses duplicates and blank names', () => {
    expect(() => S.addBeverage('BE', { name: 'orange juice', shortLabel: '', kind: 'juice', color: '#F29BE0' })(data())).toThrow(/already/);
    expect(() => S.addBeverage('BE', { name: '  ', shortLabel: '', kind: 'juice', color: '#F29BE0' })(data())).toThrow(/name/);
  });

  it('renaming carries every resident’s drink along, and Undo puts it all back', async () => {
    const users = S.drinkUsers(data(), 'BE', 'Orange Juice');
    expect(users).toBeGreaterThan(0);
    await store.change('Rename', S.updateBeverage('BE', 'Orange Juice', { name: 'Fresh OJ', shortLabel: 'OJ' }));
    expect(bev('Orange Juice')).toBeUndefined();
    expect(S.drinkUsers(data(), 'BE', 'Fresh OJ')).toBe(users);
    expect(S.drinkUsers(data(), 'BE', 'Orange Juice')).toBe(0);
    await store.undoLast();
    expect(S.drinkUsers(data(), 'BE', 'Orange Juice')).toBe(users);
    expect(bev('Fresh OJ')).toBeUndefined();
  });

  it('a new colour picks its text colour; the printed name can change', async () => {
    await store.change('Colour', S.updateBeverage('BE', 'Prune Juice', { color: '#C11749', shortLabel: 'Prune' }));
    expect(bev('Prune Juice')).toMatchObject({ color: '#C11749', textColor: '#FFFFFF', shortLabel: 'Prune' });
  });

  it('a drink someone has can’t be removed; an unused one can; coffee never', async () => {
    expect(() => S.removeBeverage('BE', 'Orange Juice')(data())).toThrow(/Change their drinks first/);
    expect(() => S.removeBeverage('BE', 'Coffee')(data())).toThrow(/Coffee/);
    await store.change('Add', S.addBeverage('BE', { name: 'Lemonade', shortLabel: '', kind: 'other', color: '#A8D85A' }));
    await store.change('Remove', S.removeBeverage('BE', 'Lemonade'));
    expect(bev('Lemonade')).toBeUndefined();
  });

  it('palette: black text at 7:1 on every colour but Cranberry, which takes white', () => {
    for (const c of DRINK_PALETTE) {
      if (c === '#C11749') expect(textColorFor(c)).toBe('#FFFFFF');
      else expect(contrast(c, '#000000')).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('Cups', () => {
  it('the setup sheet’s cups are locked; a new unused cup can be removed; a used one can’t', async () => {
    for (const c of S.CORE_DRINKWARE) expect(() => S.removeDrinkware('BE', c)(data())).toThrow(/setup sheet/);
    await store.change('Add', S.addDrinkware('BE', 'Sippy cup'));
    expect(data().drinkware.map((w) => w.name)).toContain('Sippy cup');
    const r = someone();
    const { id, ops } = addDrink(r.id, 'Dinner', 'drink', '2% Milk');
    await store.change('Give', ops);
    await store.change('Cup', updateDrink(id, { drinkware: 'Sippy cup' }));
    expect(() => S.removeDrinkware('BE', 'Sippy cup')(data())).toThrow(/uses/);
  });
});

describe('Extras list', () => {
  it('is seeded with the resident card’s old choices; Dinner and Supper offer napkins only', () => {
    expect(data().extraOptions.filter((x) => x.siteId === 'BE').map((x) => x.name)).toEqual(['Napkins', 'Jelly', 'Fruit', 'Butter', 'Big Spoon', 'Brown Sugar']);
    expect(S.extrasFor(data(), 'BE', 'Dinner').map((x) => x.name)).toEqual(['Napkins']);
    expect(S.extrasFor(data(), 'BE', 'Breakfast')).toHaveLength(6);
    expect(data().extraOptions.find((x) => x.name === 'Fruit')).toMatchObject({ variants: ['Banana', 'Orange', 'Apple'], counted: false });
  });

  it('add, rename in place, offer at every meal, remove', async () => {
    await store.change('Add', S.saveExtraOption('BE', null, { name: 'Syrup', variants: ['Maple', ' Sugar-free ', ''], allMeals: false, counted: true }));
    expect(data().extraOptions.find((x) => x.name === 'Syrup')).toMatchObject({ variants: ['Maple', 'Sugar-free'], allMeals: false });
    const before = data().extraOptions.filter((x) => x.siteId === 'BE').map((x) => x.name);
    await store.change('Edit', S.saveExtraOption('BE', 'Syrup', { name: 'Pancake syrup', variants: [], allMeals: true, counted: true }));
    const names = data().extraOptions.filter((x) => x.siteId === 'BE').map((x) => x.name);
    expect(names.indexOf('Pancake syrup')).toBe(before.indexOf('Syrup')); // keeps its place
    expect(S.extrasFor(data(), 'BE', 'Supper').map((x) => x.name)).toEqual(['Napkins', 'Pancake syrup']);
    await store.change('Remove', S.removeExtraOption('BE', 'Pancake syrup'));
    expect(names.length - 1).toBe(data().extraOptions.filter((x) => x.siteId === 'BE').length);
  });
});

describe('Meals & sections', () => {
  const seatsAt = (meal: 'Dinner' | 'Breakfast', section: number) => S.seatsInSection(data(), 'BE', meal, section).length;

  it('closing a section frees its seats in one undo step; Undo reseats everyone', async () => {
    const n = seatsAt('Dinner', 3);
    expect(n).toBeGreaterThan(0);
    await store.change('Close', S.setSectionOpen('BE', 'Dinner', 3, false));
    expect(getOpening(site(), 'Dinner').sections.map((s) => s.section)).toEqual([1, 2]);
    expect(seatsAt('Dinner', 3)).toBe(0);
    expect(sheetsFor(getOpening(site(), 'Dinner')).map((s) => s.key)).toEqual(['setup', 'server-1', 'server-2', 'prefs']);
    await store.undoLast();
    expect(seatsAt('Dinner', 3)).toBe(n);
    expect(getOpening(site(), 'Dinner').sections.map((s) => s.label)).toEqual(['Section 1', 'Section 2', 'Section 3']);
  });

  it('every meal keeps one section', () => {
    expect(() => S.setSectionOpen('BE', 'Breakfast', 2, false)(data())).toThrow(/at least one/);
  });

  it('opening a section gives it a free name and keeps room order', async () => {
    // Breakfast opens the Section 2 tables as "Section 1", so the Section 1 tables get another name.
    await store.change('Open', S.setSectionOpen('BE', 'Breakfast', 1, true));
    expect(getOpening(site(), 'Breakfast').sections).toEqual([
      { section: 1, label: 'Section 2' },
      { section: 2, label: 'Section 1' },
    ]);
  });

  it('renaming checks for blanks and duplicates', async () => {
    expect(() => S.renameSection('BE', 'Dinner', 1, ' ')(data())).toThrow(/name/);
    expect(() => S.renameSection('BE', 'Dinner', 1, 'section 2')(data())).toThrow(/already/);
    await store.change('Rename', S.renameSection('BE', 'Breakfast', 2, 'Main room'));
    expect(getOpening(site(), 'Breakfast').sections[0]!.label).toBe('Main room');
  });
});

describe('Backups setting and upgrades', () => {
  it('the backup folder is stored and can be undone', async () => {
    await store.change('Folder', S.setBackupDir('D:\\Backups'));
    expect(data().settings.backup_dir).toBe('D:\\Backups');
    await store.undoLast();
    expect(data().settings.backup_dir).toBeUndefined();
  });

  it('a version 1 database (or restored backup) upgrades to the current schema', async () => {
    // Make it a true v1 database: no extras list, no nickname column.
    await db.batch([{ sql: 'DROP TABLE extra_option' }, { sql: 'ALTER TABLE resident DROP COLUMN nickname' }, { sql: "UPDATE meta SET value = '1' WHERE key = 'schema_version'" }]);
    expect(await migrate(db)).toEqual({ seeded: false, upgradedFrom: 1 });
    const [v] = await db.select<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(Number(v!.value)).toBe(SCHEMA_VERSION);
    expect(await db.select('SELECT * FROM extra_option')).toHaveLength(12); // 6 per site
    expect(await db.select('SELECT nickname FROM resident')).not.toHaveLength(0); // v3 column, residents kept
  });

  it('refuses a newer database', async () => {
    await db.batch([{ sql: "UPDATE meta SET value = '99' WHERE key = 'schema_version'" }]);
    await expect(migrate(db)).rejects.toThrow(/newer version/);
  });
});
