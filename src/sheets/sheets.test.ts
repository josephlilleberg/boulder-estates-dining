import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import type { Chair, DiningTable, Drink, MealPrefs, Resident } from '../domain/model';
import { getOpening, type MealName } from '../domain/sites';
import { addTable, moveTable } from '../state/tableActions';
import { Store } from '../state/store';
import { corners, edgeAngle, labelInkWidth, separation, serverPills, serverRoom, setupChanges, setupRoom, stressOccupant, type RotBox } from './model';
import { buildPage, occupantFor, sheetsFor } from './pages';

const SQL = await initSqlJs();
let store: Store;

beforeEach(async () => {
  const db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

const data = () => store.get().data;
const site = () => data().sites.find((s) => s.id === 'BE')!;
const layoutTables = () => data().tables.filter((t) => t.layoutId === 'be-everyday');

let did = 0;
const drink = (beverage: string, p: Partial<Drink> = {}): Drink => ({
  id: `d${did++}`,
  slot: 'drink',
  beverage,
  tea: null,
  drinkware: 'Glass',
  amount: 'Full',
  extraGlass: false,
  creamer: false,
  ...p,
});
const coffee = (p: Partial<Drink> = {}) => drink('Coffee', { drinkware: 'Mug', ...p });
const resident = (drinks: Drink[], p: Partial<MealPrefs> = {}, chair: Chair = 'arm'): Resident => ({
  id: 'x',
  siteId: 'BE',
  first: 'Agatha',
  last: 'H',
  nickname: null,
  chair,
  archived: false,
  notes: [],
  attends: ['Dinner'],
  prefs: { Dinner: { roWater: false, hotWater: false, portion: 'Full', drinks, extras: [], ...p } },
});
const texts = (r: Resident) => setupChanges(r, 'Dinner').map((c) => c.text);

describe('Setup sheet rules', () => {
  it('the usual setting (glass + coffee mug) writes nothing', () => {
    expect(texts(resident([coffee()]))).toEqual([]);
    expect(texts(resident([coffee(), drink('2% Milk')]))).toEqual([]);
  });

  it('+Glass for an extra glass or RO water; +2 Glasses for both', () => {
    expect(texts(resident([coffee(), drink('2% Milk', { extraGlass: true })]))).toEqual(['+Glass']);
    expect(texts(resident([coffee()], { roWater: true }))).toEqual(['+Glass']);
    expect(texts(resident([coffee(), drink('2% Milk', { extraGlass: true })], { roWater: true }))).toEqual(['+2 Glasses']);
  });

  it('+Juice per juice glass, +To-Go per to-go cup, additions before No Mug', () => {
    expect(texts(resident([coffee(), drink('Orange Juice', { drinkware: 'Juice glass' })]))).toEqual(['+Juice']);
    expect(texts(resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('Apple Juice', { drinkware: 'Juice glass' })]))).toEqual(['+2 Juice', 'No Mug']);
    expect(texts(resident([coffee({ drinkware: 'To-go cup' })]))).toEqual(['+To-Go', 'No Mug']);
    for (const c of setupChanges(resident([drink('Orange Juice', { drinkware: 'Juice glass' })]), 'Dinner')) expect(c.bg).toBe(c.text === 'No Mug' ? '#FCA5A5' : '#86EFAC');
  });

  it('two of the same juice are poured together: +Glass instead of +2 Juice, one "2 Cran Juice" pill', () => {
    const jg = { drinkware: 'Juice glass' };
    // Both drinks are juice, so there's no coffee mug either.
    const pair = resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]);
    expect(texts(pair)).toEqual(['+Glass', 'No Mug']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => p.cap)).toEqual(['2 Cran Juice']);
    // With an extra glass too, the glasses add up.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { ...jg, extraGlass: true })], { hotWater: true }))).toEqual(['+2 Glasses']);
    // Not the same juice, or not both in juice glasses: nothing is combined.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]))).toEqual(['+2 Juice', 'No Mug']);
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+Juice', '+To-Go', 'No Mug']);
    expect(serverPills(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]), 'Dinner', data().beverages)).toHaveLength(2);
  });

  it('two half to-go cups of the same drink become one to-go cup', () => {
    const half = { drinkware: 'To-go cup', amount: 'Half' as const };
    const pair = resident([drink('Cranberry Juice', half), drink('Cranberry Juice', half)]);
    expect(texts(pair)).toEqual(['+To-Go', 'No Mug']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => p.cap)).toEqual(['2 Cran Juice']);
    // Full to-go cups aren't combined.
    expect(texts(resident([drink('Cranberry Juice', { drinkware: 'To-go cup' }), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+2 To-Go', 'No Mug']);
  });

  it('No Mug only when there is no mug drink and no hot water', () => {
    expect(texts(resident([drink('2% Milk')]))).toEqual(['No Mug']);
    expect(texts(resident([drink('2% Milk')], { hotWater: true }))).toEqual([]);
    expect(texts(resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' })]))).toEqual([]);
  });

  const oneTable: DiningTable[] = [{ id: 't', layoutId: 'L', section: 1, number: 1, shape: 'round', x: 300, y: 300, rotation: 0 }];
  const plan = (who: (seat: number) => Resident | null) => setupRoom([{ section: 1, label: 'Section 1' }], oneTable, (_t, s) => who(s), 'Dinner', 1552, 802);

  it('a seat pill marks each seated resident and shows their chair; empty seats get none', () => {
    const chairs: Chair[] = ['arm', 'no_arm', 'none'];
    const room = plan((s) => (s < 3 ? resident([coffee()], {}, chairs[s]) : null));
    expect(room.pills.map((p) => p.chair)).toEqual(chairs);
    expect(room.pills.every((p) => p.w === 18 && p.h === 7)).toBe(true);
  });

  it('a table where anyone takes creamer is light purple with a purple outline', () => {
    expect(plan((s) => (s === 0 ? resident([coffee()]) : null)).tables[0]).toMatchObject({ bg: '#FFFFFF', border: '1.5px solid #4B5563' });
    expect(plan((s) => (s === 0 ? resident([coffee({ creamer: true })]) : null)).tables[0]).toMatchObject({ bg: '#EDE9FE', border: '1.5px solid #6D28D9' });
  });

  it('change labels run along the table edge, never upside down', () => {
    const room = plan(() => resident([drink('2% Milk', { extraGlass: true })]));
    expect(room.changes).toHaveLength(4);
    for (const c of room.changes) expect(Math.abs(c.ang)).toBeLessThanOrEqual(90);
  });

  it('rows line up across sections at Dinner', () => {
    const opening = getOpening(site(), 'Dinner');
    const room = setupRoom(opening.sections, layoutTables(), () => null, 'Dinner', 1552, 802);
    expect(room.titles.map((t) => t.text)).toEqual(['Section 1', 'Section 2', 'Section 3']);
    // Top rows of all three sections share one height.
    const tops = [1, 2, 3].map((s) => {
      const ids = new Set(layoutTables().filter((t) => t.section === s).map((t) => t.id));
      return Math.min(...room.tables.filter((t) => ids.has(t.id)).map((t) => t.t + t.h / 2));
    });
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1);
  });
});

const stress = stressOccupant('Dinner');

describe('Server sheet spacing (stress test: two drinks at every seat)', () => {
  // A realistic extra: one seat per table also has its drink in an unusual cup (a band).
  const withBands = (meal: MealName) => {
    const base = stressOccupant(meal);
    return (tableId: string, s: number): Resident | null => {
      const r = base(tableId, s);
      if (!r || s !== 0) return r;
      const p = r.prefs[meal]!;
      return { ...r, prefs: { [meal]: { ...p, drinks: p.drinks.map((d) => (d.beverage === 'Chocolate Milk' ? { ...d, drinkware: 'Milk pitcher', extraGlass: false } : d)) } } };
    };
  };
  for (const [meal, bands] of [['Dinner', false], ['Breakfast', false], ['Supper', false], ['Dinner', true], ['Breakfast', true], ['Supper', true]] as [MealName, boolean][]) {
    it(`${meal}${bands ? ' with a cup band at every table' : ''}: 0 label overlaps and 0 off-page labels on every server sheet`, () => {
      const opening = getOpening(site(), meal);
      for (const sec of opening.sections) {
        const T = layoutTables().filter((t) => t.section === sec.section);
        const room = serverRoom(T, bands ? withBands(meal) : stressOccupant(meal), meal, data().beverages);
        expect(room.labels).toHaveLength(T.reduce((n, t) => n + (t.shape === 'round' ? 4 : 6), 0));
        const rotated = new Set(T.filter((t) => t.rotation % 90 !== 0).map((t) => t.id)); // exempt from the automatic check
        const boxes: (RotBox & { table: string; label: boolean })[] = [
          // What the label draws (name and pills), not its wider layout box.
          ...room.labels.map((l) => ({ cx: l.l + l.w / 2, cy: l.t + l.h / 2, hw: labelInkWidth(l) / 2, hh: l.h / 2, ang: l.ang, table: l.tableId, label: true })),
          ...room.tables.map((t) => ({ cx: t.l + t.w / 2, cy: t.t + t.h / 2, hw: t.w / 2, hh: t.h / 2, ang: t.rotation, table: t.id, label: false })),
        ];
        const clashes: string[] = [];
        boxes.forEach((a, i) =>
          boxes.forEach((b, j) => {
            if (j <= i || (!a.label && !b.label)) return;
            if (a.table === b.table && (!a.label || !b.label)) return; // a label sits against its own table
            if (rotated.has(a.table) || rotated.has(b.table)) return;
            const m = separation(a, b, 0);
            if (m) clashes.push(`${sec.label}: ${a.table}/${b.table} by ${m.o.toFixed(1)} px`);
          }),
        );
        expect(clashes).toEqual([]);
        for (const l of room.labels) {
          for (const [x, y] of corners({ cx: l.l + l.w / 2, cy: l.t + l.h / 2, hw: l.w / 2, hh: l.h / 2, ang: l.ang })) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(room.w);
            expect(y).toBeLessThanOrEqual(room.h);
          }
        }
      }
    });
  }

  it('labels are never upside down; coffee is not shown; half milk gets the ½ tab, juice never', () => {
    const T = layoutTables().filter((t) => t.section === 1);
    const room = serverRoom(T, stress, 'Dinner', data().beverages);
    for (const l of room.labels) {
      expect(l.alert).toBe(true); // the stress resident has a note
      expect(Math.abs(l.ang)).toBeLessThanOrEqual(90);
      expect(l.items.map((i) => i.cap).sort()).toEqual(['Choc. Milk', 'Cran Juice']);
      expect(l.items.find((i) => i.cap === 'Cran Juice')).toMatchObject({ half: false, bg: '#C11749', color: '#FFFFFF' });
    }
    const r = resident([coffee(), drink('2% Milk', { amount: 'Half' })], { hotWater: true, roWater: true });
    const one = serverRoom(T.slice(0, 1), (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages);
    expect(one.labels[0]!.items.map((i) => [i.cap, i.half])).toEqual(
      expect.arrayContaining([
        ['2% Milk', true],
        ['Hot water', false],
        ['RO', false],
      ]),
    );
    expect(one.labels[0]!.items).toHaveLength(3);
    expect(edgeAngle(0, 1)).toBe(0); // bottom seat reads upright
  });
});

describe('Room Designer changes show on every sheet (Step 4 check)', () => {
  const pagesFor = (meal: MealName) => {
    const opening = getOpening(site(), meal);
    const sheets = sheetsFor(opening);
    const occ = occupantFor(data(), 'BE', meal);
    return sheets.map((s, i) => buildPage(data(), site(), meal, opening, s, occ, i + 1, sheets.length, 'Nov 7, 2026'));
  };
  const tablesOn = (p: ReturnType<typeof pagesFor>[number]) => (p.body.kind === 'prefs' ? [] : p.body.room.tables);

  it('a new table appears on the setup sheet and its server sheet; a moved table moves', async () => {
    const before = pagesFor('Dinner');
    const { id, ops } = addTable('BE', 2, 'round');
    await store.change('Add table', ops);
    const after = pagesFor('Dinner');
    expect(tablesOn(after[0]!).some((t) => t.id === id)).toBe(true);
    expect(tablesOn(after.find((p) => p.key === 'server-2')!).some((t) => t.id === id)).toBe(true);
    expect(tablesOn(after.find((p) => p.key === 'server-1')!).some((t) => t.id === id)).toBe(false);
    expect(tablesOn(before[0]!).some((t) => t.id === id)).toBe(false);

    const t1 = layoutTables().find((t) => t.section === 1 && t.number === 1)!;
    const at = (pages: ReturnType<typeof pagesFor>) => tablesOn(pages[0]!).find((t) => t.id === t1.id)!;
    const x0 = at(pagesFor('Dinner')).l;
    await store.change('Move', moveTable(t1.id, t1.x + 40, t1.y));
    expect(at(pagesFor('Dinner')).l).toBeGreaterThan(x0);
  });

  it('pages carry the mockup header and footer', () => {
    const [setup, server, , , prefs] = pagesFor('Dinner');
    expect([setup!.title, setup!.right]).toEqual(['Dinner · Setup', 'Setup sheet · Boulder Estates']);
    expect(setup!.footer).toBe('11 × 17 · Printed Nov 7, 2026 · Page 1 of 5');
    expect([server!.title, server!.right, server!.w, server!.h]).toEqual(['Dinner · Section 1', 'Server sheet · Boulder Estates', 1056, 816]);
    expect(prefs!.footer).toBe('Letter · Printed Nov 7, 2026 · Page 5 of 5');
    expect(setup!.w / setup!.h).toBeCloseTo(17 / 11);
  });

  it('Allergies & notes lists only residents with notes or a half portion, by section', () => {
    const p = pagesFor('Dinner')[4]!;
    if (p.body.kind !== 'prefs') throw new Error('expected prefs');
    const rows = p.body.rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ head: true });
    for (const r of rows) if (!r.head) expect(r.notes !== '' || r.portion === 'Half portion').toBe(true);
  });
});

describe('cup bands', () => {
  it('a drink not in its usual cup gets a band naming the cup; the usual cup gets none', () => {
    const caps = (r: Resident) => serverPills(r, 'Dinner', data().beverages).map((p) => [p.cap, p.cup ?? null]);
    expect(caps(resident([drink('2% Milk')]))).toEqual([['2% Milk', null]]);
    expect(caps(resident([drink('2% Milk', { drinkware: 'Milk pitcher' })]))).toEqual([['2% Milk', 'Pitcher']]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'Juice glass' })]))).toEqual([['OJ', null]]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'To-go cup' })]))).toEqual([['OJ', 'To-go']]);
    // Two of the same juice poured into one glass: the glass is named.
    const jg = { drinkware: 'Juice glass' };
    expect(caps(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]))).toEqual([['2 Cran Juice', 'Glass']]);
  });

  it('the setup sheet sets a pitcher: +Pitcher', () => {
    expect(texts(resident([coffee(), drink('2% Milk', { drinkware: 'Milk pitcher' })]))).toEqual(['+Pitcher']);
  });
});

describe('allergy flags', () => {
  it('a resident with allergies or notes gets the red ! on the server sheet; others do not', () => {
    const T = layoutTables().filter((t) => t.section === 1).slice(0, 1);
    const withNote = { ...resident([coffee()]), notes: [{ id: 'n', text: 'Nut allergy' }] };
    const without = resident([coffee()]);
    expect(serverRoom(T, (_t, s) => (s === 0 ? withNote : null), 'Dinner', data().beverages).labels[0]!.alert).toBe(true);
    expect(serverRoom(T, (_t, s) => (s === 0 ? without : null), 'Dinner', data().beverages).labels[0]!.alert).toBe(false);
  });
});
