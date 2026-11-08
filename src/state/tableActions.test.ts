import initSqlJs from 'sql.js';
import { seedTestDb } from '../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../db/migrate';
import { sqljsDb } from '../db/sqljsDb';
import { footprint, overlapWarnings, rowsOf, sectionSummary } from '../domain/room';
import { Store } from './store';
import * as T from './tableActions';

const SQL = await initSqlJs();

let db: ReturnType<typeof sqljsDb>;
let store: Store;

beforeEach(async () => {
  db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

async function restart(): Promise<Store> {
  const reopened = sqljsDb(SQL, db.raw.export());
  await migrate(reopened);
  return Store.open(reopened);
}

const data = (s: Store = store) => s.get().data;
const tbl = (id: string, s: Store = store) => data(s).tables.find((t) => t.id === id);
const section = (n: number, s: Store = store) => data(s).tables.filter((t) => t.layoutId === 'be-everyday' && t.section === n);
const snapshot = (s: Store = store) => structuredClone({ tables: data(s).tables, seating: data(s).seating });

describe('room geometry', () => {
  it('the seeded room is already evenly spaced (Even out spacing changes nothing)', async () => {
    for (const n of [1, 2, 3]) {
      await store.change('Even out', T.evenOutSpacing('BE', n));
    }
    await store.change('Even out', T.evenOutSpacing('HSP', 1));
    expect(store.canUndo).toBe(false);
  });

  it('reads rows from the room the way the mockup hard-coded them', () => {
    const nums = (n: number) => rowsOf(section(n)).map((r) => r.map((t) => t.number));
    expect(nums(1)).toEqual([[1, 2], [3, 4], [5, 6, 7]]);
    expect(nums(2)).toEqual([[1, 2, 3, 4], [5, 6, 7]]);
    expect(nums(3)).toEqual([[1, 2], [3, 4], [5, 6, 7]]);
  });

  it('the seeded room has no warnings', () => {
    expect(overlapWarnings(data().tables).size).toBe(0);
  });

  it('Section 1 count matches the brief', () => {
    expect(sectionSummary(section(1))).toEqual({ tables: 7, round: 4, rect: 3, seats: 34 });
  });

  it('a rotated rectangle takes up a square footprint', () => {
    expect(footprint({ shape: 'rect', rotation: 45 })).toEqual([138, 138]);
    expect(footprint({ shape: 'rect', rotation: 270 })).toEqual([107, 153]);
  });
});

describe('every Room Designer edit survives a restart and can be undone', () => {
  it('move: clamped inside the room, residents keep their seats', async () => {
    const before = snapshot();
    await store.change('Move', T.moveTable('be1-1', -500, 400.4));
    expect(tbl('be1-1')).toMatchObject({ x: 40, y: 400 });
    expect(tbl('be1-1', await restart())).toMatchObject({ x: 40, y: 400 });
    expect(data().seating).toEqual(before.seating);
    await store.undoLast();
    expect(snapshot()).toEqual(before);
  });

  it('rotate: 45° steps, wraps both ways', async () => {
    await store.change('Rotate', T.rotateTable('be1-2', -1));
    expect(tbl('be1-2')?.rotation).toBe(315);
    await store.change('Rotate', T.rotateTable('be1-2', 2));
    expect(tbl('be1-2', await restart())?.rotation).toBe(45);
    await store.undoLast();
    await store.undoLast();
    expect(tbl('be1-2')?.rotation).toBe(0);
  });

  it('add: next number, saved, undoable', async () => {
    const before = snapshot();
    const { id, ops } = T.addTable('BE', 2, 'round');
    await store.change('Add', ops);
    const t = tbl(id)!;
    expect(t).toMatchObject({ section: 2, number: 8, shape: 'round', rotation: 0, layoutId: 'be-everyday' });
    expect(tbl(id, await restart())).toEqual(t);
    await store.undoLast();
    expect(snapshot()).toEqual(before);
  });

  it('add: lands in a clear spot when there is room; a full room gets it in the middle, flagged', async () => {
    // Section 2 is full: like the mockup, the new table goes mid-room and shows a warning.
    const full = T.addTable('BE', 2, 'rect');
    await store.change('Add', full.ops);
    expect(tbl(full.id)).toMatchObject({ x: 520, y: 400 });
    expect(overlapWarnings(section(2)).has(full.id)).toBe(true);
    await store.undoLast();

    await store.change('Delete', T.deleteTable('be3-6'));
    await store.change('Delete', T.deleteTable('be3-7'));
    const { id, ops } = T.addTable('BE', 3, 'round');
    await store.change('Add', ops);
    expect(tbl(id)?.number).toBe(6); // next after the highest number left
    expect(overlapWarnings(section(3)).size).toBe(0);
  });

  it('duplicate: same shape and rotation, next number', async () => {
    await store.change('Rotate', T.rotateTable('be3-5', 1));
    const { id, ops } = T.duplicateTable('be3-5');
    await store.change('Duplicate', ops);
    const src = tbl('be3-5')!;
    expect(tbl(id)).toMatchObject({ shape: src.shape, rotation: 45, section: 3, number: 8, x: src.x + 60, y: src.y + 60 });
    await store.undoLast();
    expect(tbl(id)).toBeUndefined();
  });

  it('delete: frees its seats at every meal; Undo brings back the table and everyone at it', async () => {
    // A Section 2 table is open at Dinner and Breakfast, so it has residents at both.
    const busy = section(2).find((t) => new Set(T.seatedAt(data(), t.id).map((s) => s.meal)).size > 1);
    expect(busy).toBeDefined();
    const before = snapshot();
    const seated = T.seatedAt(data(), busy!.id).length;

    await store.change('Delete', T.deleteTable(busy!.id));
    expect(tbl(busy!.id)).toBeUndefined();
    expect(data().seating).toHaveLength(before.seating.length - seated);
    expect(tbl(busy!.id, await restart())).toBeUndefined();

    await store.undoLast();
    expect(snapshot()).toEqual(before);
  });

  it('Even out spacing puts a dragged table back in line, as one undo step', async () => {
    const home = structuredClone(section(1));
    await store.change('Move', T.moveTable('be1-6', home.find((t) => t.id === 'be1-6')!.x + 30, home.find((t) => t.id === 'be1-6')!.y - 20));
    await store.change('Rotate', T.rotateTable('be1-1', 1));
    await store.change('Even out', T.evenOutSpacing('BE', 1));
    const after = section(1);
    expect(after.find((t) => t.id === 'be1-6')).toMatchObject({ x: home.find((t) => t.id === 'be1-6')!.x, y: home.find((t) => t.id === 'be1-6')!.y });
    expect(overlapWarnings(after).size).toBe(0);
    await store.undoLast();
    expect(tbl('be1-6')?.x).toBe(home.find((t) => t.id === 'be1-6')!.x + 30);
  });

  it('flags tables pushed together', async () => {
    const [a, b] = section(3);
    await store.change('Move', T.moveTable(a!.id, b!.x + 40, b!.y));
    const w = overlapWarnings(section(3));
    expect(w.get(a!.id)).toBe(`Too close to Table ${b!.number}. Seats will bump.`);
    expect(w.get(b!.id)).toBe(`Too close to Table ${a!.number}. Seats will bump.`);
  });
});
