import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import { drinkUnits, hasAmount, JUICE_CUPS, MILK_CUPS, type Chair, type DiningTable, type Drink, type MealPrefs, type Resident } from '../domain/model';
import { getOpening, type MealName } from '../domain/sites';
import { addTable, moveTable } from '../state/tableActions';
import { Store } from '../state/store';
import { corners, edgeAngle, labelInkWidth, MIN_LABEL_SCALE, PILL_W, SEAT_H, SEAT_W, separation, serverPills, serverRoom, serverSeatSpaces, setupChanges, setupRoom, stressOccupant } from './model';
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

  it('two of the same juice are poured together into the usual glass: no +2 Juice, one "2 Cran Juice" pill', () => {
    const jg = { drinkware: 'Juice glass' };
    // Both drinks are juice, so there's no coffee mug either; the juice uses the usual glass.
    const pair = resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]);
    expect(texts(pair)).toEqual(['No Mug']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => p.cap)).toEqual(['2 Cranberry']);
    // With an extra glass too, the glasses add up.
    // With an extra glass (for water), one more glass.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { ...jg, extraGlass: true })], { hotWater: true }))).toEqual(['+Glass']);
    // Not the same juice, or not both in juice glasses: nothing is combined.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]))).toEqual(['+2 Juice', 'No Mug']);
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+Juice', '+To-Go', 'No Mug']);
    expect(serverPills(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]), 'Dinner', data().beverages)).toHaveLength(2);
  });

  it('two half to-go cups of the same drink become one to-go cup', () => {
    const half = { drinkware: 'To-go cup', amount: 'Half' as const };
    const pair = resident([drink('Cranberry Juice', half), drink('Cranberry Juice', half)]);
    expect(texts(pair)).toEqual(['+To-Go', 'No Mug']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => [p.cap, p.half])).toEqual([['2 Cranberry', false]]); // two halves make a full cup
    // Full to-go cups aren't combined.
    expect(texts(resident([drink('Cranberry Juice', { drinkware: 'To-go cup' }), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+2 To-Go', 'No Mug']);
  });

  it('glasses: the usual glass holds the first drink in a glass; more glasses are added', () => {
    expect(texts(resident([drink('Orange Juice', { drinkware: 'Glass', amount: 'Full' })]))).toEqual(['No Mug']); // full glass of juice
    expect(texts(resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Glass', amount: 'Half' })]))).toEqual(['+Glass', 'No Mug']);
    const half = serverPills(resident([drink('Orange Juice', { drinkware: 'To-go cup', amount: 'Half' })]), 'Dinner', data().beverages)[0]!;
    expect([half.cap, half.half, half.cup]).toEqual(['Orange', true, 'To-go']);
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

describe('Server sheet spacing: any combination fits', () => {
  // Rotated tables included. Every label is drawn inside its seat's space (SEAT_W × SEAT_H, smaller if it has to be), so
  // two checks cover any mix of residents: the spaces never overlap, and every label fits its space.
  for (const meal of ['Breakfast', 'Dinner', 'Supper'] as MealName[]) {
    it(`${meal}: no two seat spaces overlap, and none is off the page, on any server sheet`, () => {
      for (const sec of getOpening(site(), meal).sections) {
        const T = layoutTables().filter((t) => t.section === sec.section);
        const B = serverSeatSpaces(T);
        const clashes: string[] = [];
        B.forEach((a, i) =>
          B.forEach((b, j) => {
            if (j <= i || (a.body && b.body)) return;
            if (a.tableId === b.tableId && (a.body || b.body)) return; // a label sits against its own table
            const m = separation(a, b, 0);
            if (m) clashes.push(`${sec.label}: ${a.tableId}/${b.tableId} by ${m.o.toFixed(1)} px`);
          }),
        );
        expect(clashes).toEqual([]);
        for (const x of B) for (const [px, py] of corners(x)) expect(px >= -0.01 && py >= -0.01 && px <= 972.01 && py <= 676.01).toBe(true);
      }
    });
  }

  it('every combination of drinks, cups, halves, water and a long name fits its seat space, drawn at 85% or larger', () => {
    const bevs = data().beverages.filter((b) => b.siteId === 'BE' && b.kind !== 'coffee');
    const cups = data().drinkware.filter((w) => w.siteId === 'BE').map((w) => w.name);
    const cupsFor = (kind: string) => (kind === 'tea' ? ['Mug'] : kind === 'milk' ? [...MILK_CUPS, 'Milk pitcher'] : kind === 'juice' ? JUICE_CUPS : cups); // pitcher: older records
    const singles: Drink[] = bevs.flatMap((b) => cupsFor(b.kind).flatMap((w) => (hasAmount(w) ? (['Full', 'Half'] as const) : (['Full'] as const)).map((amount) => drink(b.name, { drinkware: w, amount }))));
    const kindOf = (d: Drink) => bevs.find((b) => b.name === d.beverage)!.kind;
    const fits = (ds: Drink[]) => ds.reduce((n, d) => n + drinkUnits(d, kindOf(d)), 0) <= 2;
    const combos: Drink[][] = [[], ...singles.map((d) => [d]), ...singles.flatMap((d, i) => singles.slice(i).map((e) => [d, { ...e, id: `${e.id}b` }])).filter(fits)];
    const T = layoutTables().filter((t) => t.shape === 'rect').slice(0, 1);
    let smallest = 1;
    let worst = '';
    for (const ds of combos) {
      for (const water of [{}, { hotWater: true }, { roWater: true }]) {
        const r = { ...resident(ds, water), first: 'Wilhelmina', notes: [{ id: 'n', text: 'Nuts' }] };
        const [l] = serverRoom(T, (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages).labels;
        expect(l!.w).toBeLessThanOrEqual(SEAT_W);
        expect(l!.h).toBeLessThanOrEqual(SEAT_H + 0.01);
        expect(labelInkWidth(l!)).toBeLessThanOrEqual(SEAT_W);
        if (l!.scale < smallest) [smallest, worst] = [l!.scale, l!.items.map((i) => `${i.half ? '½ ' : ''}${i.cap}${i.cup ? ` (${i.cup})` : ''}`).join(' + ')];
      }
    }
    expect(combos.length).toBeGreaterThan(500); // 640 today, each with no water, hot water and RO
    expect(smallest, worst).toBeGreaterThanOrEqual(MIN_LABEL_SCALE);
  });

  it('labels are never upside down; coffee is not shown; half milk gets the ½ tab, juice never', () => {
    const T = layoutTables().filter((t) => t.section === 1);
    const room = serverRoom(T, stress, 'Dinner', data().beverages);
    for (const l of room.labels) {
      expect(Math.abs(l.ang)).toBeLessThanOrEqual(90);
      expect(l.items.map((i) => i.cap).sort()).toEqual(['Choc. Milk', 'Cranberry']);
      expect(l.items.find((i) => i.cap === 'Cranberry')).toMatchObject({ half: false, bg: '#C11749', color: '#FFFFFF' });
    }
    const r = resident([coffee(), drink('2% Milk', { amount: 'Half' })], { hotWater: true, roWater: true });
    const one = serverRoom(T.slice(0, 1), (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages);
    // Hot water / RO is a tag after the name, not a pill.
    expect(one.labels[0]!.items.map((i) => [i.cap, i.half])).toEqual([['2% Milk', true]]);
    expect(one.labels[0]!.water).toBe('HOT');
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
  const tablesOn = (p: ReturnType<typeof pagesFor>[number]) => p.body.room.tables;

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
    const pages = pagesFor('Dinner');
    const [setup, server] = pages;
    expect(pages.map((p) => p.key)).toEqual(['setup', 'server-1', 'server-2', 'server-3']); // allergies and notes are on each server sheet
    expect([setup!.title, setup!.right]).toEqual(['Dinner · Setup', 'Setup sheet · Boulder Estates']);
    expect(setup!.footer).toBe('11 × 17 · Printed Nov 7, 2026 · Page 1 of 4');
    expect([server!.title, server!.right, server!.w, server!.h]).toEqual(['Dinner · Section 1', 'Server sheet · Boulder Estates', 1056, 816]);
    expect(pages[3]!.footer).toBe('Letter · Printed Nov 7, 2026 · Page 4 of 4');
    expect(setup!.w / setup!.h).toBeCloseTo(17 / 11);
  });


});

describe('cup bands', () => {
  it('every drink names its cup in a band, the usual cup too', () => {
    const caps = (r: Resident) => serverPills(r, 'Dinner', data().beverages).map((p) => [p.cap, p.cup]);
    expect(caps(resident([drink('2% Milk')]))).toEqual([['2% Milk', 'Glass']]);
    expect(caps(resident([drink('2% Milk', { drinkware: 'Milk pitcher' })]))).toEqual([['2% Milk', 'Pitcher']]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'Juice glass' })]))).toEqual([['Orange', 'Juice glass']]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'To-go cup' })]))).toEqual([['Orange', 'To-go']]);
    expect(caps(resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' })]))).toEqual([['Tea', 'Mug']]);
    // Two of the same juice poured into one glass: the glass is named.
    const jg = { drinkware: 'Juice glass' };
    expect(caps(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]))).toEqual([['2 Cranberry', 'Glass']]);
  });

  it('the pills on a label are all one width', () => {
    const T = layoutTables().filter((t) => t.section === 1).slice(0, 1);
    const r = resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'To-go cup', amount: 'Half' })]);
    const [l] = serverRoom(T, (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages).labels;
    expect(l!.pillW).toBe(PILL_W);
  });

  it('the setup sheet sets a pitcher: +Pitcher', () => {
    expect(texts(resident([coffee(), drink('2% Milk', { drinkware: 'Milk pitcher' })]))).toEqual(['+Pitcher']);
  });
});

describe('server sheet notes', () => {
  const T = () => layoutTables().filter((t) => t.section === 1);
  const page = (occ: (t: string, s: number) => Resident | null) => {
    const opening = getOpening(site(), 'Dinner');
    const sheet = sheetsFor(opening).find((x) => x.kind === 'server')!;
    return buildPage(data(), site(), 'Dinner', opening, sheet, occ, 1, 1, 'Nov 11, 2026');
  };

  it('allergies, notes and half portions are listed by table under the drawing; no key, no red !', () => {
    const first = T().sort((a, b) => a.number - b.number)[0]!;
    const withNote = { ...resident([coffee()], { portion: 'Half' }), notes: [{ id: 'n', text: 'Nut allergy' }] };
    const plain = { ...resident([coffee()]), first: 'Bea' };
    const pg = page((t, s) => (t === first.id ? (s === 0 ? withNote : s === 1 ? plain : null) : null));
    expect(pg.body.kind === 'server' && pg.body.notes).toEqual([{ table: first.number, name: 'Agatha H.', text: 'Nut allergy, ½ portion' }]);
    expect(pg.body.kind === 'server' && pg.body.roomScale).toBe(1);
  });

  it('a long list makes the drawing give up height, never below half size', () => {
    const r = { ...resident([coffee()]), notes: [{ id: 'n', text: 'Allergic to shellfish and tree nuts; cut food small; sits near the window' }] };
    const pg = page(() => r);
    if (pg.body.kind !== 'server') throw new Error('server page');
    expect(pg.body.notes.length).toBeGreaterThan(20);
    expect(pg.body.roomScale).toBeLessThan(1);
    expect(pg.body.roomScale).toBeGreaterThanOrEqual(0.5);
  });
});

