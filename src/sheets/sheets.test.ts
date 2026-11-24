import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import { drinkUnits, hasAmount, JUICE_CUPS, MILK_CUPS, type Chair, type DiningTable, type Drink, type MealPrefs, type Resident } from '../domain/model';
import { getOpening, type MealName } from '../domain/sites';
import { addTable, moveTable } from '../state/tableActions';
import { Store } from '../state/store';
import { textW, ARM_TAG_H, BOX_LINE_H, CHAIR_TAG_H, CHIP_MAX_W, CHIP_W, chipRows, chipW, corners, evenChips, edgeAngle, EXTRA_BG, itemH, labelInkWidth, noMug, MIN_SHEET_SCALE, PILL_W, SEAT_W, SERVER_GAP, SETUP_GAP, separation, serverPills, serverRoom, setupChanges, setupRoom, stressOccupant, twoDrinksOccupant, type RotBox, type ServerRoom } from './model';
import { buildPage, occupantFor, orderExtras, SHARE_SERVER_SIZE, sharedLayout, sheetsFor } from './pages';

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
  apt: null,
  diabetic: false,
  status: 'here',
  awayUntil: null,
  archived: false,
  notes: [],
  attends: ['Dinner'],
  onPlan: ['Dinner'],
  prefs: { Dinner: { roWater: false, hotWater: false, portion: 'Full', drinks, extras: [], ...p } },
});
// The setup chips, then "Mug" when the mug comes off the table (drawn on the table as a red dot, not as a chip).
const texts = (r: Resident) => [...setupChanges(r, 'Dinner').map((c) => c.text), ...(noMug(r, 'Dinner') ? ['Mug on table'] : [])];

describe('Setup sheet rules', () => {
  it('the usual setting (glass + coffee mug) writes nothing', () => {
    expect(texts(resident([coffee()]))).toEqual([]);
    expect(texts(resident([coffee(), drink('2% Milk')]))).toEqual([]);
  });

  it('+Glass for each glass beyond the usual one; RO water uses the usual glass when no drink does', () => {
    expect(texts(resident([coffee(), drink('2% Milk', { extraGlass: true })]))).toEqual(['+Glass']);
    expect(texts(resident([coffee()], { roWater: true }))).toEqual([]); // RO water goes in the usual glass
    expect(texts(resident([coffee(), drink('2% Milk', { extraGlass: true })], { roWater: true }))).toEqual(['+2 Glasses']);
  });

  it('+Juice per juice glass, +To-Go per to-go cup, additions; the mug comes off on the table', () => {
    expect(texts(resident([coffee(), drink('Orange Juice', { drinkware: 'Juice glass' })]))).toEqual(['+Juice']);
    expect(texts(resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('Apple Juice', { drinkware: 'Juice glass' })]))).toEqual(['+2 Juice', 'Mug on table']);
    expect(texts(resident([coffee({ drinkware: 'To-go cup' })]))).toEqual(['+To-Go', 'Mug on table']);
    for (const c of setupChanges(resident([drink('Orange Juice', { drinkware: 'Juice glass' })]), 'Dinner')) expect(c.bg).toBe('#86EFAC');
  });

  it('two of the same juice are poured together into the usual glass: no +2 Juice, one Cranberry pill in a GLASS', () => {
    const jg = { drinkware: 'Juice glass' };
    // Both drinks are juice, so there's no coffee mug either; the juice uses the usual glass.
    const pair = resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]);
    expect(texts(pair)).toEqual(['Mug on table']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => p.cap)).toEqual(['Cranberry']);
    // With an extra glass (for water), one more glass; hot water adds its pitcher.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { ...jg, extraGlass: true })], { hotWater: true }))).toEqual(['+Glass', '+Pitcher', 'Mug on table']);
    // Not the same juice, or not both in juice glasses: nothing is combined.
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]))).toEqual(['+2 Juice', 'Mug on table']);
    expect(texts(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+Juice', '+To-Go', 'Mug on table']);
    expect(serverPills(resident([drink('Cranberry Juice', jg), drink('Apple Juice', jg)]), 'Dinner', data().beverages)).toHaveLength(2);
  });

  it('two half to-go cups of the same drink become one to-go cup', () => {
    const half = { drinkware: 'To-go cup', amount: 'Half' as const };
    const pair = resident([drink('Cranberry Juice', half), drink('Cranberry Juice', half)]);
    expect(texts(pair)).toEqual(['+To-Go', 'Mug on table']);
    expect(serverPills(pair, 'Dinner', data().beverages).map((p) => [p.cap, p.half])).toEqual([['Cranberry', false]]); // two halves make a full cup
    // Full to-go cups aren't combined.
    expect(texts(resident([drink('Cranberry Juice', { drinkware: 'To-go cup' }), drink('Cranberry Juice', { drinkware: 'To-go cup' })]))).toEqual(['+2 To-Go', 'Mug on table']);
  });

  it('glasses: the usual glass holds the first drink in a glass; more glasses are added', () => {
    expect(texts(resident([drink('Orange Juice', { drinkware: 'Glass', amount: 'Full' })]))).toEqual(['Mug on table']); // full glass of juice
    expect(texts(resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Glass', amount: 'Half' })]))).toEqual(['+Glass', 'Mug on table']);
    const half = serverPills(resident([drink('Orange Juice', { drinkware: 'To-go cup', amount: 'Half' })]), 'Dinner', data().beverages)[0]!;
    expect([half.cap, half.half, half.cup]).toEqual(['Orange', true, 'To-go']);
  });

  it('Mug comes off when there is no coffee or tea; hot water comes in a pitcher, not a mug', () => {
    expect(texts(resident([drink('2% Milk')]))).toEqual(['Mug on table']);
    expect(texts(resident([drink('2% Milk')], { hotWater: true }))).toEqual(['+Pitcher', 'Mug on table']);
    expect(texts(resident([coffee(), drink('2% Milk', { drinkware: 'Milk pitcher' })], { hotWater: true }))).toEqual(['+2 Pitchers']);
    expect(texts(resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' })]))).toEqual([]);
  });

  const oneTable: DiningTable[] = [{ id: 't', layoutId: 'L', section: 1, number: 1, shape: 'round', x: 300, y: 300, rotation: 0 }];
  const plan = (who: (seat: number) => Resident | null) => setupRoom([{ section: 1, label: 'Section 1' }], oneTable, (_t, s) => who(s), 'Dinner', 1552, 802);

  it('a seat pill marks each seated resident and shows their chair; empty seats get none', () => {
    const chairs: Chair[] = ['arm', 'no_arm', 'none'];
    const room = plan((s) => (s < 3 ? resident([coffee()], {}, chairs[s]) : null));
    expect(room.pills.map((p) => p.chair)).toEqual(chairs);
    // One length for every chair, reading along the edge, never upside down; the plain arm chair mark is thinner.
    expect(new Set(room.pills.map((p) => p.w)).size).toBe(1);
    expect(room.pills.map((p) => p.h)).toEqual([ARM_TAG_H, CHAIR_TAG_H, CHAIR_TAG_H]);
    for (const p of room.pills) expect(Math.abs(p.ang)).toBeLessThanOrEqual(90);
    // A round table: each mark bends along its circle, a bit under a quarter of it, so they don't touch.
    for (const p of room.pills) {
      expect(p.arc).toBeDefined();
      expect(p.w).toBeLessThan((Math.PI * p.arc!.r) / 2);
    }
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

describe('Setup sheet spacing: a clear gap between tables, rows kept', () => {
  const PW = 1632 - 80;
  const PH = 1056 - 150 - 20 - 84;
  // Chips and tables of different tables never touch (the gap less a little for the chip nudging),
  // tables keep their left-to-right order within a row, and chips stay in their own section.
  const check = (meal: MealName, occ: (t: string, s: number) => Resident | null) => {
    const opening = getOpening(site(), meal);
    const T = layoutTables().filter((t) => opening.sections.some((s) => s.section === t.section));
    const room = setupRoom(opening.sections, T, occ, meal, PW, PH);
    const boxes: (RotBox & { table: string; chip: boolean })[] = [
      ...room.changes.map((c) => ({ cx: c.l + c.w / 2, cy: c.t + c.h / 2, hw: c.w / 2, hh: c.h / 2, ang: c.ang, table: c.tableId, chip: true })),
      ...room.tables.map((t) => ({ cx: t.l + t.w / 2, cy: t.t + t.h / 2, hw: t.w / 2, hh: t.h / 2, ang: t.rotation, table: t.id, chip: false })),
    ];
    const problems: string[] = [];
    boxes.forEach((a, i) =>
      boxes.forEach((b, j) => {
        if (j <= i || a.table === b.table || (!a.chip && !b.chip)) return;
        if (separation(a, b, SETUP_GAP - 6)) problems.push(`${a.table}/${b.table} too close`);
      }),
    );
    const drawn = new Map(room.tables.map((t) => [t.id, t.l + t.w / 2]));
    for (const a of T)
      for (const b of T)
        if (a.section === b.section && Math.abs(a.y - b.y) < 1 && a.x < b.x && drawn.get(a.id)! >= drawn.get(b.id)!) problems.push(`${a.id} and ${b.id} swapped`);
    const edges = [0, ...room.dividers.map((d) => d.l), room.w];
    for (const c of room.changes) {
      const sec = T.find((t) => t.id === c.tableId)!.section;
      const k = opening.sections.findIndex((s) => s.section === sec);
      const [x0, x1] = [edges[k]!, edges[k + 1]!];
      for (const [x] of corners({ cx: c.l + c.w / 2, cy: c.t + c.h / 2, hw: c.w / 2, hh: c.h / 2, ang: c.ang })) if (x < x0 - 0.5 || x > x1 + 0.5) problems.push(`${c.tableId} chip crosses into another section`);
    }
    return { problems, room };
  };
  const busy = (meal: MealName): Resident => ({
    ...resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk', { drinkware: 'To-go cup', extraGlass: false })], { roWater: true, hotWater: true }),
    attends: [meal],
    prefs: { [meal]: resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk', { drinkware: 'To-go cup' })], { roWater: true, hotWater: true }).prefs.Dinner! },
  });

  for (const meal of ['Breakfast', 'Dinner', 'Supper'] as MealName[]) {
    it(`${meal}: chips at every seat keep their gap, rows and sections`, () => {
      const { problems, room } = check(meal, () => busy(meal));
      expect(problems).toEqual([]);
      expect(room.scale).toBeGreaterThanOrEqual(0.5);
    });
  }

  it('the test app’s worst case (two drinks, RO water, three extras at every seat) keeps its gaps and rows, and fits the page', () => {
    const { problems, room } = check('Dinner', stressOccupant('Dinner', { heavy: true }));
    expect(problems).toEqual([]);
    // Tables in a row stay level: crowding only ever moves them sideways.
    const T = layoutTables();
    const top = new Map(room.tables.map((t) => [t.id, t.t + t.h / 2]));
    for (const a of T) for (const b of T) if (a.section === b.section && Math.abs(a.y - b.y) < 1 && top.has(a.id) && top.has(b.id)) expect(Math.abs(top.get(a.id)! - top.get(b.id)!)).toBeLessThan(1);
    expect((room.w + 2) * room.scale).toBeLessThanOrEqual(PW + 4);
    expect((room.h + 2) * room.scale).toBeLessThanOrEqual(PH + 4);
  });

  it('at every seat, on every side of every table, the drinkware sits next to the table and the extras box outside it', () => {
    const { room } = check('Dinner', stressOccupant('Dinner', { heavy: true }));
    const centre = new Map(room.tables.map((t) => [t.id, [t.l + t.w / 2, t.t + t.h / 2] as const]));
    const wrong: string[] = [];
    for (const c of room.changes) {
      // Each row's centre on the page: rows run top to bottom (3 px apart) in the block, turned by c.ang.
      const heights = c.rows.map((row) => Math.max(...row.map(itemH)));
      const total = heights.reduce((a, h) => a + h, 0) + 3 * (heights.length - 1);
      const a = (c.ang * Math.PI) / 180;
      let y = -total / 2;
      const at = heights.map((h) => {
        const mid = y + h / 2;
        y += h + 3;
        return [c.l + c.w / 2 - Math.sin(a) * mid, c.t + c.h / 2 + Math.cos(a) * mid] as const;
      });
      const [tx, ty] = centre.get(c.tableId)!;
      const d = (k: number) => Math.hypot(at[k]![0] - tx, at[k]![1] - ty);
      const box = c.rows.findIndex((row) => row.some((x) => x.entries));
      const drink = c.rows.findIndex((row) => row.every((x) => !x.entries));
      if (box >= 0 && drink >= 0 && d(drink) >= d(box)) wrong.push(`${c.tableId} at ${Math.round(c.ang)}°`);
    }
    expect(wrong).toEqual([]);
  });

  it('random mixes keep their gap, rows and sections', () => {
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pool = [busy('Dinner'), resident([coffee(), drink('2% Milk')]), resident([drink('Orange Juice', { drinkware: 'Juice glass' })]), resident([coffee()], { roWater: true })];
    for (let n = 0; n < 10; n++) {
      const at = new Map<string, Resident | null>();
      const occ = (t: string, s: number) => {
        const k = `${t}:${s}`;
        if (!at.has(k)) at.set(k, rand() < 0.25 ? null : pool[Math.floor(rand() * pool.length)]!);
        return at.get(k)!;
      };
      expect(check('Dinner', occ).problems, `mix #${n}`).toEqual([]);
    }
  });

  it('drawn larger, a round table’s chair marks still fit their words', () => {
    const { room } = check('Dinner', () => resident([coffee()], {}, 'none'));
    const arcs = room.pills.filter((p) => p.arc);
    expect(arcs.length).toBeGreaterThan(0);
    // Curved words are 8 px: they need their width plus a little room at each end.
    for (const p of arcs) expect(p.w).toBeGreaterThanOrEqual((textW('No chair') * 8) / 9 + 6);
  });

  it('a light meal is drawn larger to use the page, still fitting it', () => {
    const { room } = check('Dinner', () => resident([coffee(), drink('2% Milk')]));
    expect(room.scale).toBeGreaterThan(1);
    expect((room.w + 2) * room.scale).toBeLessThanOrEqual(PW + 4);
    expect((room.h + 2) * room.scale).toBeLessThanOrEqual(PH + 4);
  });
});

const stress = stressOccupant('Dinner');

describe('Server sheet spacing: any combination fits, with a clear gap between tables', () => {
  // Labels and tables of different tables never come closer than the gap (a little tolerance for
  // the nudging), and nothing is off the page. Same-table labels can't touch: a label is at most
  // SEAT_W wide and seats are 76 px apart.
  const clashes = (room: ReturnType<typeof serverRoom>) => {
    const boxes: (RotBox & { table: string; label: boolean })[] = [
      ...room.labels.map((l) => ({ cx: l.l + l.w / 2, cy: l.t + l.h / 2, hw: l.w / 2, hh: l.h / 2, ang: l.ang, table: l.tableId, label: true })),
      ...room.tables.map((t) => ({ cx: t.l + t.w / 2, cy: t.t + t.h / 2, hw: t.w / 2, hh: t.h / 2, ang: t.rotation, table: t.id, label: false })),
    ];
    const out: string[] = [];
    boxes.forEach((a, i) =>
      boxes.forEach((b, j) => {
        if (j <= i || a.table === b.table || (!a.label && !b.label)) return;
        const m = separation(a, b, SERVER_GAP - 3);
        if (m) out.push(`${a.table}/${b.table} by ${m.o.toFixed(1)} px`);
      }),
    );
    for (const l of room.labels) for (const [x, y] of corners({ cx: l.l + l.w / 2, cy: l.t + l.h / 2, hw: l.w / 2, hh: l.h / 2, ang: l.ang })) if (x < -0.01 || y < -0.01 || x > room.w + 0.01 || y > room.h + 0.01) out.push(`${l.tableId} off the page`);
    return out;
  };
  // The most a seat can have: two drinks with cup bands (one half) and RO water.
  const full = (meal: MealName) => (): Resident => ({
    ...resident([drink('Prune Juice', { drinkware: 'To-go cup', amount: 'Half' }), drink('2% Milk', { drinkware: 'Juice glass' })], { roWater: true }),
    first: 'Wilhelmina',
    attends: [meal],
    prefs: { [meal]: resident([drink('Prune Juice', { drinkware: 'To-go cup', amount: 'Half' }), drink('2% Milk', { drinkware: 'Juice glass' })], { roWater: true }).prefs.Dinner! },
  });

  for (const meal of ['Breakfast', 'Dinner', 'Supper'] as MealName[]) {
    it(`${meal}: the fullest possible seating fits every section, shrinking no further than needed`, () => {
      for (const sec of getOpening(site(), meal).sections) {
        const T = layoutTables().filter((t) => t.section === sec.section);
        const room = serverRoom(T, full(meal), meal, data().beverages);
        expect(clashes(room), sec.label).toEqual([]);
        expect(room.scale).toBeGreaterThanOrEqual(MIN_SHEET_SCALE);
      }
    });
  }

  it('random mixes of residents and empty seats fit with the gap on every section', { timeout: 60000 }, () => {
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pool: Resident[] = [
      full('Dinner')(),
      resident([drink('Orange Juice', { drinkware: 'Juice glass' })]),
      resident([coffee(), drink('2% Milk')], { hotWater: true }),
      resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' }), drink('Apple Juice', { drinkware: 'Glass', amount: 'Half' })], { roWater: true }),
      resident([coffee()]),
    ];
    for (const meal of ['Breakfast', 'Dinner', 'Supper'] as MealName[]) {
      for (const sec of getOpening(site(), meal).sections) {
        const T = layoutTables().filter((t) => t.section === sec.section);
        for (let n = 0; n < 8; n++) {
          const at = new Map<string, Resident | null>();
          const occ = (t: string, s: number) => {
            const k = `${t}:${s}`;
            if (!at.has(k)) at.set(k, rand() < 0.2 ? null : pool[Math.floor(rand() * pool.length)]!);
            return at.get(k)!;
          };
          expect(clashes(serverRoom(T, occ, meal, data().beverages)), `${meal} ${sec.label} #${n}`).toEqual([]);
        }
      }
    }
  });

  it('tables keep their arrangement whether people have one drink, two, or nobody is seated', () => {
    for (const sec of getOpening(site(), 'Dinner').sections) {
      const T = layoutTables().filter((t) => t.section === sec.section);
      const one = serverRoom(T, () => resident([coffee(), drink('2% Milk')]), 'Dinner', data().beverages);
      const two = serverRoom(T, () => resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk', { drinkware: 'To-go cup', amount: 'Half' })]), 'Dinner', data().beverages);
      const empty = serverRoom(T, () => null, 'Dinner', data().beverages);
      // A table left of (or above) another in the room stays left of (above) it on the sheet; only the spacing follows the labels.
      const swapped = (r: typeof one) => {
        const at = new Map(r.tables.map((t) => [t.id, t]));
        const out: string[] = [];
        for (const a of T)
          for (const b of T) {
            if (a.x < b.x - 20 && at.get(a.id)!.l + at.get(a.id)!.w / 2 >= at.get(b.id)!.l + at.get(b.id)!.w / 2) out.push(`${a.number} right of ${b.number}`);
            if (a.y < b.y - 20 && at.get(a.id)!.t + at.get(a.id)!.h / 2 >= at.get(b.id)!.t + at.get(b.id)!.h / 2) out.push(`${a.number} below ${b.number}`);
          }
        return out;
      };
      for (const r of [one, two, empty]) expect(swapped(r), sec.label).toEqual([]);
      expect(clashes(two)).toEqual([]);
    }
  });


  it('every combination of drinks, cups, halves and water fits a seat’s width, at 85% or larger', () => {
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
        const r = { ...resident(ds, water), first: 'Wilhelmina' };
        const [l] = serverRoom(T, (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages).labels;
        expect(labelInkWidth(l!)).toBeLessThanOrEqual(SEAT_W);
        if (l!.scale < smallest) [smallest, worst] = [l!.scale, l!.items.map((i) => `${i.half ? '½ ' : ''}${i.cap}${i.cup ? ` (${i.cup})` : ''}`).join(' + ')];
      }
    }
    expect(combos.length).toBeGreaterThan(500); // 640 today, each with no water, hot water and RO
    expect(smallest, worst).toBeGreaterThanOrEqual(0.85);
  });

  it('labels are never upside down; coffee is not shown; half milk gets ½ in its band, juice never; RO on the table, no hot water pill', () => {
    const T = layoutTables().filter((t) => t.section === 1);
    const room = serverRoom(T, stress, 'Dinner', data().beverages);
    for (const l of room.labels) {
      expect(Math.abs(l.ang)).toBeLessThanOrEqual(90);
      expect(l.items.map((i) => i.cap).sort()).toEqual(['Choc. Milk', 'Cranberry']);
      expect(l.items.find((i) => i.cap === 'Cranberry')).toMatchObject({ half: false, bg: '#C11749', color: '#FFFFFF' });
    }
    const r = resident([coffee(), drink('2% Milk', { amount: 'Half' })], { hotWater: true, roWater: true });
    const one = serverRoom(T.slice(0, 1), (_t, s) => (s === 0 ? r : null), 'Dinner', data().beverages);
    // Hot water isn't a pill (it comes in a pitcher); RO water is a small RO pill on the table under the
    // name, reading the same way, so the label keeps room for just the drinks.
    expect(one.labels[0]!.items.map((i) => [i.cap, i.half, i.cup])).toEqual([['2% Milk', true, 'Glass']]);
    expect(one.mugs).toHaveLength(1);
    expect(one.mugs[0]).toMatchObject({ ro: true, ang: one.labels[0]!.ang });
    const t0 = one.tables[0]!;
    const [mx, my] = [one.mugs[0]!.l + one.mugs[0]!.w / 2, one.mugs[0]!.t + one.mugs[0]!.h / 2];
    expect(mx > t0.l && mx < t0.l + t0.w && my > t0.t && my < t0.t + t0.h).toBe(true); // on the table
    expect(edgeAngle(0, 1)).toBe(0); // bottom seat reads upright
  });
});

describe('Room Designer changes show on every sheet (Step 4 check)', () => {
  const pagesFor = (meal: MealName) => {
    const opening = getOpening(site(), meal);
    const sheets = sheetsFor(opening);
    const occ = occupantFor(data(), 'BE', meal);
    return sheets.map((s) => buildPage(data(), site(), meal, opening, s, occ, 'Nov 7, 2026'));
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
  }, 20000);

  it('a server sheet uses the whole page under its header: labels near full size, drawn larger only when they fit', () => {
    const bodies = pagesFor('Dinner').flatMap((p) => (p.body.kind === 'server' ? [p.body] : []));
    expect(bodies).toHaveLength(3);
    for (const b of bodies) {
      expect([b.room.w, b.room.h].map((x) => Math.round(x * (b.fit ?? 1)))).toEqual([1056 - 28, 816 - 64 - 2]); // no notes list under the drawing
      expect(b.room.scale).toBeGreaterThanOrEqual(0.75); // Section 3 keeps Table 4 under Table 2, beside an angled Table 7
      if ((b.fit ?? 1) > 1) expect(b.room.scale).toBe(1);
    }
    // With SHARE_SERVER_SIZE, one size for every section's sheet; otherwise each is as large as it fits.
    if (SHARE_SERVER_SIZE) expect(new Set(bodies.map((b) => `${b.fit ?? 1}×${b.room.scale}`)).size).toBe(1);
  });

  it('pages carry a title and, top right, when the sheets last changed; no footer', () => {
    const pages = pagesFor('Dinner');
    const [setup, server] = pages;
    expect(pages.map((p) => p.key)).toEqual(['setup', 'server-1', 'server-2', 'server-3']); // allergies and notes are on each server sheet
    expect([setup!.title, setup!.right]).toEqual(['Dinner · Setup', 'Updated Nov 7, 2026']);
    expect([server!.title, server!.right, server!.w, server!.h]).toEqual(['Dinner · Section 1', 'Updated Nov 7, 2026', 1056, 816]);
    expect('footer' in setup!).toBe(false);
    expect(setup!.w / setup!.h).toBeCloseTo(17 / 11);
  });


});

describe('cup bands', () => {
  it('every drink names its cup in a band, the usual cup too; tea names which tea', () => {
    const caps = (r: Resident) => serverPills(r, 'Dinner', data().beverages).map((p) => [p.cap, p.cup]);
    expect(caps(resident([drink('2% Milk')]))).toEqual([['2% Milk', 'Glass']]);
    expect(caps(resident([drink('2% Milk', { drinkware: 'Milk pitcher' })]))).toEqual([['2% Milk', 'Pitcher']]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'Juice glass' })]))).toEqual([['Orange', 'Juice glass']]);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'To-go cup' })]))).toEqual([['Orange', 'To-go']]);
    expect(caps(resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' })]))).toEqual([['Tea', 'Green']]); // a mug isn't filled, so the band says which tea
    expect(caps(resident([drink('Tea', { drinkware: 'Mug', tea: 'Chamomile' })]))).toEqual([['Tea', 'Chamomile']]);
    // Two of the same juice poured into one glass: the glass is named.
    const jg = { drinkware: 'Juice glass' };
    expect(caps(resident([drink('Cranberry Juice', jg), drink('Cranberry Juice', jg)]))).toEqual([['Cranberry', 'Glass']]);
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

describe('pill order and extras', () => {
  it('pills go milk, juice, tea, other, then water, whatever order the card has them in', () => {
    const caps = (r: Resident) => serverPills(r, 'Dinner', data().beverages).map((p) => p.cap);
    expect(caps(resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk')], { roWater: true }))).toEqual(['2% Milk', 'Orange']); // RO: on the table, not a pill
    expect(caps(resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Juice glass' })], { hotWater: true }))).toEqual(['2% Milk', 'Orange']); // hot water: a pitcher, not poured
    expect(caps(resident([drink('Tea', { drinkware: 'Mug', tea: 'Chamomile' }), drink('Apple Juice', { drinkware: 'Juice glass' })]))).toEqual(['Apple', 'Tea']);
  });

  it('the setup sheet puts the extras in one box after the drinkware, an extra per line', () => {
    const r = resident([coffee(), drink('2% Milk'), drink('Orange Juice', { drinkware: 'Juice glass' })], { extras: [{ id: 'e1', name: 'Fruit', variant: 'Banana', backup: null, count: 1 }, { id: 'e2', name: 'Napkins', variant: null, backup: null, count: 2 }] });
    expect(setupChanges(r, 'Dinner').map((c) => [c.text, c.lines ?? null, c.bg])).toEqual([
      ['+Juice', null, '#86EFAC'],
      ['Banana, Napkins ×2', ['Banana', 'Napkins ×2'], EXTRA_BG],
    ]);
    // The box is as tall as its lines and always gets a row of its own.
    const [, box] = setupChanges(r, 'Dinner');
    expect(itemH(box!)).toBe(2 + 4 + 2 * BOX_LINE_H);
    expect(chipRows(setupChanges(r, 'Dinner')).map((row) => row.length)).toEqual([1, 1]);
    expect(texts(resident([drink('2% Milk')], { extras: [{ id: 'e3', name: 'Soup Spoon', variant: null, backup: null, count: 1 }] }))).toEqual(['Soup Spoon', 'Mug on table']);
    // A bowl reads by its kind, on one line, like fruit does.
    const bowl = setupChanges(resident([coffee()], { extras: [{ id: 'e4', name: 'Bowl', variant: 'Cereal', backup: null, count: 1 }] }), 'Dinner').find((c) => c.entries);
    expect(bowl!.entries).toEqual([{ head: 'Cereal Bowl' }]);
  });
});

describe('setup chip layout', () => {
  it('chips stack in one even column, in order: drinkware, then extras', () => {
    const c = (text: string) => ({ text, bg: '#86EFAC' });
    expect(chipRows([c('+Glass'), c('+Juice'), c('Banana')]).map((r) => r.map((x) => x.text))).toEqual([['+Glass'], ['+Juice'], ['Banana']]);
    expect(new Set([c('+Glass'), c('+2 Pitchers'), { text: 'Napkins ×2', lines: ['Napkins ×2'], bg: EXTRA_BG }].map(chipW)).size).toBe(1);
  });

  it('extras follow the Settings list order on every seat; ones not on the list go last, alphabetically', () => {
    const x = (name: string) => ({ name });
    const order = ['Napkins', 'Soup Spoon', 'Butter', 'Jelly', 'Brown Sugar', 'Fruit'];
    expect(orderExtras([x('Fruit'), x('Syrup'), x('Jelly'), x('Soup Spoon'), x('Napkins'), x('Honey')], order).map((e) => e.name)).toEqual(['Napkins', 'Soup Spoon', 'Jelly', 'Fruit', 'Honey', 'Syrup']);
    expect(orderExtras([x('Soup Spoon'), x('Fruit')], ['Fruit', 'Soup Spoon']).map((e) => e.name)).toEqual(['Fruit', 'Soup Spoon']);
  });

  it('an extra with kinds shows its name and count and the kind bulleted under it, never a backup; Fruit stays just the kind', () => {
    const x = (id: string, name: string, variant: string | null, count = 1, backup: string | null = null) => ({ id, name, variant, backup, count });
    const r = resident([coffee()], { extras: [x('a', 'Jelly', 'Grape', 2), x('b', 'Fruit', 'Banana'), x('c', 'Soup Spoon', null), x('d', 'Jelly', 'Mixed Fruit', 1, '*any*')] });
    const box = setupChanges(r, 'Dinner').find((c) => c.lines)!;
    evenChips([box], SEAT_W);
    expect(box.rows!.map((row) => [row.text, row.bullet, row.indent > 0])).toEqual([
      ['Jelly ×2', false, false],
      ['Grape', true, true],
      ['Banana', false, false],
      ['Soup Spoon', false, false],
      ['Jelly', false, false],
      ['Mixed Fruit', true, true],
    ]);
    expect(itemH(box)).toBe(2 + 4 + 6 * BOX_LINE_H);
    const named = setupChanges(resident([coffee()], { extras: [x('f', 'Fruit', 'Banana', 1, 'Apple'), x('g', 'Fruit', 'Orange', 1, '*any*')] }), 'Dinner').find((c) => c.lines)!;
    evenChips([named], SEAT_W);
    expect(named.rows!.map((row) => row.text)).toEqual(['Banana', 'Orange']); // "else Apple" stays on the card
    expect(named.text).toBe('Banana, Orange');
    // Without kinds, nothing changes: one line each, no bullets.
    const plain = setupChanges(resident([coffee()], { extras: [x('e', 'Napkins', null, 2)] }), 'Dinner').find((c) => c.lines)!;
    evenChips([plain]);
    expect(plain.rows).toEqual([{ text: 'Napkins ×2', indent: 0, bullet: false }]);
  });

  it('each extra is one line; the sheet’s chips all widen to the longest line, up to a cap', () => {
    const long = (name: string) => resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Juice glass' })], { extras: [{ id: 'e1', name, variant: null, backup: null, count: 1 }] });
    const items = [...setupChanges(long('Mixed Fruit Jelly'), 'Dinner'), ...setupChanges(long('Banana'), 'Dinner')];
    expect(items.find((c) => c.lines)!.lines).toEqual(['Mixed Fruit Jelly']);
    evenChips(items);
    const w = new Set(items.map(chipW));
    expect(w.size).toBe(1);
    expect([...w][0]).toBeGreaterThan(CHIP_W);
    const huge = setupChanges(long('Peanut butter and grape jelly on the side'), 'Dinner');
    evenChips(huge);
    expect(chipW(huge[0])).toBe(CHIP_MAX_W);
  });

  it('the chair pill sits centred on the table edge, and the red no-mug dot on the table just inside it', () => {
    const opening = getOpening(site(), 'Dinner');
    const T = layoutTables().filter((t) => t.section === 1 && t.shape === 'round').slice(0, 1);
    const room = setupRoom(opening.sections, T, (_t, s) => (s === 2 ? resident([drink('2% Milk')]) : null), 'Dinner', 1552, 802);
    const t = room.tables[0]!;
    const [p] = room.pills;
    const [m] = room.mugs;
    const cy = t.t + t.h / 2;
    // Seat 2 is the bottom seat: the pill's centre is on the bottom edge, the marker above it, inside the table.
    expect(Math.abs(p!.t + p!.h / 2 - (t.t + t.h))).toBeLessThan(1);
    expect(m!.t + m!.h).toBeLessThanOrEqual(p!.t + 0.5);
    expect(m!.t).toBeGreaterThan(cy);
    expect(m!.dot).toBe(true);
  });
});

describe('Breakfast: setup and server sheets share one layout', () => {
  const opening = () => getOpening(site(), 'Breakfast');
  const pagesOf = (occ: (t: string, s: number) => Resident | null) => sheetsFor(opening()).map((sh) => buildPage(data(), site(), 'Breakfast', opening(), sh, occ, 'Nov 18, 2026'));
  const r = (): Resident => {
    const x = { ...resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk')], { extras: [{ id: 'e', name: 'Fruit', variant: 'Banana', backup: null, count: 1 }] }), attends: ['Breakfast' as const] };
    x.prefs = { Breakfast: x.prefs.Dinner! };
    return x;
  };

  it('the tables keep the same arrangement on both; the setup sheet spreads them across the full 11 × 17 width', () => {
    const [setup, server] = pagesOf(() => r());
    if (setup!.body.kind !== 'server' || server!.body.kind !== 'server') throw new Error('shared layout pages');
    const order = (room: ServerRoom, axis: 'x' | 'y') =>
      [...room.tables].sort((a, b) => (axis === 'x' ? a.l + a.w / 2 - (b.l + b.w / 2) : a.t + a.h / 2 - (b.t + b.h / 2)) || a.id.localeCompare(b.id)).map((t) => t.id);
    expect(order(setup!.body.room, 'x')).toEqual(order(server!.body.room, 'x'));
    expect(order(setup!.body.room, 'y')).toEqual(order(server!.body.room, 'y'));
    // Drawn across the page's width (all of it but the 42 px margins), not just as wide as the Letter drawing scales to.
    expect((setup!.body.room.w + 2) * setup!.body.roomScale).toBeGreaterThan(setup!.w - 84 - 6);
    expect(setup!.paper).toBe('tabloid');
    expect(server!.paper).toBe('letter');
  });

  it('the setup sheet shows chips, chairs and the red dot; the server sheet names and drinks', () => {
    const [setup, server] = pagesOf(() => r());
    if (setup!.body.kind !== 'server' || server!.body.kind !== 'server') throw new Error('shared layout pages');
    const s0 = setup!.body.room.labels[0]!;
    expect([s0.name, s0.items.length, s0.chips.map((c) => c.text)]).toEqual(['', 0, ['+Juice', 'Banana']]);
    expect(setup!.body.room.pills).toHaveLength(setup!.body.room.labels.length);
    expect(setup!.body.room.mugs.every((m) => m.dot)).toBe(true);
    expect([setup!.body.legend, setup!.body.notesShown]).toEqual(['setup', false]);
    expect(setup!.body.roomScale).toBeGreaterThan(1); // the Letter drawing, enlarged to fill 11 × 17
    const v0 = server!.body.room.labels[0]!;
    expect([v0.name, v0.items.map((i) => i.cap), v0.chips]).toEqual(['Agatha H.', ['2% Milk', 'Orange'], []]);
    expect(server!.body.room.pills).toEqual([]);
    expect([server!.body.legend, server!.body.notesShown]).toEqual([null, false]);
  });
});

describe('Supper: + on added cups', () => {
  const plus = (r: Resident) => serverPills(r, 'Dinner', data().beverages, { adds: true }).map((p) => `${p.plus ? '+' : ''}${p.cap}`);
  it('the first drink in a glass uses the usual glass; every other cup is added; mugs never are', () => {
    expect(plus(resident([coffee(), drink('2% Milk')]))).toEqual(['2% Milk']);
    expect(plus(resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Glass', amount: 'Half' })]))).toEqual(['2% Milk', '+Orange']);
    expect(plus(resident([drink('Orange Juice', { drinkware: 'To-go cup' })], { hotWater: true }))).toEqual(['+Orange', '+Hot water']);
    expect(plus(resident([drink('Tea', { drinkware: 'Mug', tea: 'Green Tea' })]))).toEqual(['Tea']);
    // Two of the same juice poured together go into the usual glass.
    expect(plus(resident([drink('Cranberry Juice', { drinkware: 'Juice glass' }), drink('Cranberry Juice', { drinkware: 'Juice glass' })]))).toEqual(['Cranberry']);
    // An extra glass (for water) is a Water pill with a +.
    expect(plus(resident([drink('2% Milk', { extraGlass: true })]))).toEqual(['2% Milk', '+Water']);
    // No drink in a glass: RO water uses the usual glass, so only the juice glass is added.
    expect(plus(resident([drink('Orange Juice', { drinkware: 'Juice glass' })], { roWater: true }))).toEqual(['+Orange', 'RO water']);
  });
  it('Breakfast and Dinner pills have no + and no Water pill', () => {
    expect(serverPills(resident([drink('2% Milk', { extraGlass: true }), drink('Orange Juice', { drinkware: 'Juice glass' })]), 'Dinner', data().beverages).map((p) => [p.cap, !!p.plus])).toEqual([
      ['2% Milk', false],
      ['Orange', false],
    ]);
  });
});

describe('Supper: one combined page', () => {
  const opening = () => getOpening(site(), 'Supper');
  it('Supper has a single 11 × 17 "Setup & drinks" page; Breakfast and Dinner keep theirs', () => {
    expect(sheetsFor(opening()).map((s) => [s.key, s.paper])).toEqual([['combined', 'tabloid']]);
    expect(sheetsFor(getOpening(site(), 'Dinner')).map((s) => s.key)).toEqual(['setup', 'server-1', 'server-2', 'server-3']);
  });

  it('each seat has its setup chips and chair, then the name and drinks; tables keep a clear gap', () => {
    const r: Resident = { ...resident([drink('Orange Juice', { drinkware: 'Juice glass' }), drink('2% Milk')], { roWater: true, extras: [{ id: 'e', name: 'Napkins', variant: null, backup: null, count: 1 }] }), attends: ['Supper'] };
    r.prefs = { Supper: r.prefs.Dinner! };
    const sheet = sheetsFor(opening())[0]!;
    const pg = buildPage(data(), site(), 'Supper', opening(), sheet, () => r, 'Nov 18, 2026');
    if (pg.body.kind !== 'server') throw new Error('server-style page');
    const room = pg.body.room;
    expect(pg.body.legend).toBe('supper');
    expect(room.labels.length).toBeGreaterThan(0);
    expect(room.pills).toHaveLength(room.labels.length); // a chair pill at every seated seat
    // Only the extras are chips; added cups get a + on their band instead of +Glass / +Juice chips.
    expect(room.labels[0]!.chips.map((c) => c.text)).toEqual(['Napkins']);
    expect(room.labels[0]!.items.map((i) => [i.cap, !!i.plus])).toEqual([
      ['2% Milk', false], // the usual glass
      ['Orange', true], // a juice glass is added
      ['RO water', true], // and a glass for RO water
    ]);
    expect(room.mugs.every((m) => m.dot)).toBe(true); // no coffee or tea: a red dot on the table at every seat
    expect(room.mugs).toHaveLength(room.labels.length);
    const boxes = [
      ...room.labels.map((l) => ({ cx: l.l + l.w / 2, cy: l.t + l.h / 2, hw: l.w / 2, hh: l.h / 2, ang: l.ang, table: l.tableId, label: true })),
      ...room.tables.map((t) => ({ cx: t.l + t.w / 2, cy: t.t + t.h / 2, hw: t.w / 2, hh: t.h / 2, ang: t.rotation, table: t.id, label: false })),
    ];
    const clashes: string[] = [];
    boxes.forEach((a, i) => boxes.forEach((b, j) => {
      if (j > i && a.table !== b.table && (a.label || b.label) && separation(a, b, SERVER_GAP - 3)) clashes.push(`${a.table}/${b.table}`);
    }));
    expect(clashes).toEqual([]);
    expect(room.scale).toBeGreaterThanOrEqual(MIN_SHEET_SCALE);
  });
  it('on a table set at an angle, every seat’s chips stay off the chair marks', () => {
    // Everyone takes a pitcher and three extras, so the angled tables' blocks crowd each other.
    const extras = [
      { id: 'a', name: 'Napkins', variant: null, backup: null, count: 2 },
      { id: 'b', name: 'Jelly', variant: 'Grape', backup: null, count: 2 },
      { id: 'c', name: 'Fruit', variant: 'Banana', backup: null, count: 1 },
    ];
    const r = resident([drink('2% Milk')], { hotWater: true, extras }, 'none');
    const opening = getOpening(site(), 'Dinner');
    const room = setupRoom(opening.sections, layoutTables(), () => r, 'Dinner', 1552, 802);
    const angled = new Set(room.tables.filter((t) => t.rotation % 90).map((t) => t.id));
    expect(angled.size).toBeGreaterThan(0);
    // A pill's centre (plus half its height) inside a block, as drawn turned, is a clash.
    const inside = (c: (typeof room.changes)[number], x: number, y: number, pad: number) => {
      const a = (c.ang * Math.PI) / 180;
      const dx = x - (c.l + c.w / 2);
      const dy = y - (c.t + c.h / 2);
      return Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) < c.w / 2 + pad && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) < c.h / 2 + pad;
    };
    const clashes = room.changes.filter((c) => angled.has(c.tableId)).filter((c) => room.pills.some((p) => inside(c, p.l + p.w / 2, p.t + p.h / 2, p.h / 2)));
    expect(clashes).toEqual([]);
  });
});

describe('server sheet notes', () => {
  const T = () => layoutTables().filter((t) => t.section === 1);
  const page = (occ: (t: string, s: number) => Resident | null) => {
    const opening = getOpening(site(), 'Dinner');
    const sheet = sheetsFor(opening).find((x) => x.kind === 'server')!;
    return buildPage(data(), site(), 'Dinner', opening, sheet, occ, 'Nov 11, 2026');
  };

  it('no notes list under the drawing; a near-empty section is laid out exactly like a full one', () => {
    const first = T().sort((a, b) => a.number - b.number)[0]!;
    const withNote = { ...resident([coffee()], { portion: 'Half' }), notes: [{ id: 'n', text: 'Nut allergy' }] };
    const pg = page((t, s) => (t === first.id && s === 0 ? withNote : null));
    if (pg.body.kind !== 'server') throw new Error('server page');
    expect([pg.body.notes, pg.body.notesShown]).toEqual([[], false]);
    // Rule: every seat keeps room for two drinks, seated or not, so who's seated never changes the layout.
    const full = page(() => resident([drink('2% Milk'), drink('Orange Juice', { drinkware: 'Juice glass' })]));
    if (full.body.kind !== 'server') throw new Error('server page');
    const shape = (b: typeof pg.body) => [b.fit, b.room.scale, b.room.tables.map((t) => [Math.round(t.l), Math.round(t.t)])];
    expect(shape(pg.body)).toEqual(shape(full.body));
  });

  it('every seated place keeps room for two drinks: adding a second moves no table', () => {
    const one = resident([coffee()]);
    const two = resident([coffee(), drink('2% Milk')]);
    const at = (r: Resident) => {
      const pg = page(() => r);
      if (pg.body.kind !== 'server') throw new Error('server page');
      return [pg.body.fit, pg.body.room.scale, pg.body.room.tables.map((t) => [Math.round(t.l), Math.round(t.t)])];
    };
    expect(at(one)).toEqual(at(two));
  });
});

describe('stress test: 2 drinks', () => {
  it('keeps the real seating; every resident has exactly two drinks, their own first', () => {
    const none = resident([]);
    const one = resident([drink('2% Milk')]);
    const cran = resident([coffee(), drink('Cranberry Juice')]);
    const occ = twoDrinksOccupant((_t, s) => (s === 0 ? none : s === 1 ? one : s === 2 ? cran : null), 'Dinner', data().beverages);
    const bevs = (s: number) => occ('t', s)?.prefs.Dinner?.drinks.map((d) => d.beverage);
    expect(bevs(0)).toHaveLength(2);
    expect(bevs(1)).toEqual(['2% Milk', 'Cranberry Juice']);
    expect(bevs(2)).toEqual(['Coffee', 'Cranberry Juice', 'Chocolate Milk']); // coffee kept, not counted; no second cranberry
    expect(occ('t', 3)).toBeNull();
    expect(occ('t', 1)!.chair).toBe(one.chair);
    expect(occ('t', 1)!.prefs.Dinner?.roWater).toBe(false);
    expect(twoDrinksOccupant(() => one, 'Dinner', data().beverages, { ro: true })('t', 0)!.prefs.Dinner?.roWater).toBe(true); // 2 drinks + RO
  });
});

describe('server sheet tables never move with what residents drink', () => {
  // Rule: a server sheet is laid out as if every seat had a name and two drinks, so the stress tests
  // (2 drinks, 2 drinks + RO, Full) show the tables exactly where they always are, and adding drinks
  // (0 to 2) or RO water never shifts anything.
  it.each(['Dinner', 'Breakfast'] as MealName[])('%s: Off, 2 drinks, 2 drinks + RO (and Full, where nothing else is shared) lay out every server sheet the same', (meal) => {
    const opening = getOpening(site(), meal);
    const real = occupantFor(data(), 'BE', meal);
    // A one-section meal's server sheet shares its setup sheet's layout, which also keeps room for each
    // resident's extras: Full (three extras everywhere) moves that one, drinks never do.
    const modes = [real, twoDrinksOccupant(real, meal, data().beverages), twoDrinksOccupant(real, meal, data().beverages, { ro: true }), ...(sharedLayout(opening) ? [] : [stressOccupant(meal, { heavy: true })])];
    const layout = (occ: typeof real) =>
      sheetsFor(opening)
        .filter((sh) => sh.kind === 'server')
        .map((sh) => {
          const b = buildPage(data(), site(), meal, opening, sh, occ, '').body;
          if (b.kind !== 'server') throw new Error('server page');
          return [sh.key, b.fit ?? 1, b.room.scale, b.room.tables.map((t) => [t.id, Math.round(t.l), Math.round(t.t)])];
        });
    const off = layout(modes[0]!);
    expect(off.length).toBeGreaterThan(0);
    for (const m of modes.slice(1)) expect(layout(m)).toEqual(off);
  }, 30000);

  it('a one-section meal: drinks (0 to 2) never move a table on its setup or server sheet', () => {
    for (const meal of ['Breakfast'] as MealName[]) {
      const opening = getOpening(site(), meal);
      if (!sharedLayout(opening)) continue;
      const real = occupantFor(data(), 'BE', meal);
      const places = (occ: typeof real) =>
        sheetsFor(opening).map((sh) => buildPage(data(), site(), meal, opening, sh, occ, '').body.room.tables.map((t) => [t.id, Math.round(t.l), Math.round(t.t)]));
      expect(places(twoDrinksOccupant(real, meal, data().beverages))).toEqual(places(real));
    }
  });

  it('tables in different rows only part up and down: a table stays in the column of the one above it', () => {
    const opening = getOpening(site(), 'Dinner');
    const sh = sheetsFor(opening).find((x) => x.key === 'server-3')!;
    const b = buildPage(data(), site(), 'Dinner', opening, sh, stressOccupant('Dinner', { heavy: true }), '').body;
    if (b.kind !== 'server') throw new Error('server page');
    const cx = (n: number) => { const t = b.room.tables.find((x) => x.number === n)!; return Math.round(t.l + t.w / 2); };
    // In the room, Table 4 is straight under Table 2; the angled Table 7 below it doesn't push it aside.
    expect(cx(4)).toBe(cx(2));
  });
});
