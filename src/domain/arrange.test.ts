import { describe, expect, it } from 'vitest';
import { arrange, type ArrangeTable, type Party } from './arrange';

const round = (n: number, section = 1): ArrangeTable => ({ id: `T${n}`, section, number: n, seats: 4 });
const rect = (n: number, section = 1): ArrangeTable => ({ id: `T${n}`, section, number: n, seats: 6 });
const p = (id: string, usualTable: string | null, usualSeat: number | null, guests = 0, added = false): Party => ({ residentId: id, name: id, guests, usualTable, usualSeat, added });

const where = (r: ReturnType<typeof arrange>, id: string, guest = 0) => r.seats.find((s) => s.residentId === id && s.guest === guest);
const tableOf = (r: ReturnType<typeof arrange>, id: string) => where(r, id)?.tableId;
const adjacent = (a: number, b: number, n: number) => (a - b + n) % n === 1 || (b - a + n) % n === 1;

describe('arrange', () => {
  it('keeps everyone at their usual table and seat when nothing changed', () => {
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T1', 2), p('x', 'T1', 3), p('c', 'T2', 1), p('d', 'T2', 2), p('e', 'T2', 3)]);
    expect(where(r, 'a')).toMatchObject({ tableId: 'T1', seat: 0 });
    expect(where(r, 'b')).toMatchObject({ tableId: 'T1', seat: 2 });
    expect(where(r, 'c')).toMatchObject({ tableId: 'T2', seat: 1 });
    expect(r.notes).toEqual([]);
    expect(r.unplaced).toEqual([]);
  });

  it('seats guests beside their host', () => {
    const r = arrange([rect(1)], [p('a', 'T1', 0, 2), p('b', 'T1', 3)]);
    const host = where(r, 'a')!.seat;
    expect(host).toBe(0);
    const g = [where(r, 'a', 1)!.seat, where(r, 'a', 2)!.seat];
    expect(g.every((s) => adjacent(s, host, 6) || g.some((o) => adjacent(s, o, 6)))).toBe(true);
    expect(where(r, 'b')!.seat).toBe(3);
  });

  it('moves a group that outgrew its table to another table, together', () => {
    // Tim, Paul and Kim (Table 1, 4 seats) bring 2 guests: 5 people. Table 2 (6 seats) is free.
    const r = arrange([round(1), rect(2)], [p('tim', 'T1', 0, 2), p('paul', 'T1', 1), p('kim', 'T1', 2)]);
    expect(['tim', 'paul', 'kim'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2']);
    expect(r.notes[0]).toMatch(/moved from Table 1 to Table 2 together/);
  });

  it('fills the space left with added residents, biggest party first, best fit', () => {
    const r = arrange([round(1), rect(2)], [p('a', 'T1', 0, 2), p('new1', null, null, 0, true), p('new3', null, null, 3, true)]);
    expect(tableOf(r, 'a')).toBe('T1');
    expect(tableOf(r, 'new3')).toBe('T2'); // a party of 4 doesn't fit the 1 left at Table 1
    expect(tableOf(r, 'new1')).toBe('T1'); // best fit: Table 1 has 1 left, Table 2 has 2
  });

  it('never goes over without permission, and says who doesn’t fit', () => {
    const r = arrange([round(1)], [p('a', 'T1', 0, 3), p('b', null, null, 1, true)]);
    expect(r.unplaced.map((x) => x.residentId)).toEqual(['b']);
    expect(r.seats.every((s) => s.seat < 4)).toBe(true);
    const ok = arrange([round(1)], [p('a', 'T1', 0, 3), p('b', null, null, 1, true)], { allowOver: true });
    expect(ok.unplaced).toEqual([]);
    expect(ok.seats.filter((s) => s.seat >= 4)).toHaveLength(2);
    expect(ok.notes.join(' ')).toMatch(/2 over/);
  });

  it('splits a group only when no table seats them all, keeping parties whole', () => {
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0, 1), p('b', 'T1', 1, 1), p('c', 'T1', 2)]);
    expect(r.unplaced).toEqual([]);
    for (const id of ['a', 'b', 'c']) expect(r.seats.filter((s) => s.residentId === id).every((s) => s.tableId === tableOf(r, id))).toBe(true);
    expect(r.notes.join(' ')).toMatch(/had to split/);
  });

  it('a party never splits across tables', () => {
    const r = arrange([round(1), round(2)], [p('big', null, null, 5, true)]);
    expect(r.unplaced.map((x) => x.residentId)).toEqual(['big']);
  });

  it('works around pinned seats, and a pinned party’s new guest sits beside them', () => {
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0, 1), p('b', 'T1', 1)], { fixed: [{ tableId: 'T2', seat: 2, residentId: 'a', guest: 0 }] });
    expect(r.seats.some((s) => s.residentId === 'a' && s.guest === 0)).toBe(false); // pinned seat isn't repeated
    const g = where(r, 'a', 1)!;
    expect(g.tableId).toBe('T2');
    expect(adjacent(g.seat, 2, 4)).toBe(true);
    expect(tableOf(r, 'b')).toBe('T2'); // alone at Table 1, so joins the pinned table rather than leave gaps
  });

  it('merges half-empty tables: the smaller group joins the bigger one', () => {
    // After cancellations Table 1 has 1 person and Table 2 has 2.
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T2', 0), p('c', 'T2', 2)]);
    expect(['a', 'b', 'c'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2']);
    expect(where(r, 'b')!.seat).toBe(0); // the group that stays keeps its seats
    expect(where(r, 'c')!.seat).toBe(2);
    expect(r.notes).toEqual(['a joined Table 2 so Table 1 isn’t needed.']);
  });

  it('leaves tables more than half full alone, and never opens an empty table to merge', () => {
    const full = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T1', 1), p('c', 'T1', 2), p('d', 'T2', 0), p('e', 'T2', 1), p('f', 'T2', 2)]);
    expect(full.notes).toEqual([]);
    const alone = arrange([round(1), round(2)], [p('a', 'T1', 0)]);
    expect(tableOf(alone, 'a')).toBe('T1');
  });

  it('moves a table’s group whole or not at all', () => {
    // Table 3's 3 would fit only by splitting between Table 1 and Table 2 (2 free each).
    const r = arrange(
      [rect(1), rect(2), rect(3)],
      [...['a', 'b', 'c', 'd'].map((id, i) => p(id, 'T1', i)), ...['e', 'f', 'g', 'h'].map((id, i) => p(id, 'T2', i)), p('x', 'T3', 0), p('y', 'T3', 1), p('z', 'T3', 2)],
    );
    expect(['x', 'y', 'z'].map((id) => tableOf(r, id))).toEqual(['T3', 'T3', 'T3']);
  });

  it('merging never crosses sections: a half-empty table stays rather than send people to another section', () => {
    const t1 = { ...round(1, 1), id: 'S1T1' };
    const t2 = { ...round(1, 2), id: 'S2T1' };
    const r = arrange([t1, t2], [p('a', 'S1T1', 0), p('b', 'S2T1', 0), p('c', 'S2T1', 1)]);
    expect(tableOf(r, 'a')).toBe('S1T1');
    expect(r.notes).toEqual([]);
  });

  it('a group that outgrows its table moves within its section, even if another section fits tighter', () => {
    // Section 1: Table 1 (4 seats, 5 coming) and Table 2 (6 seats, empty). Section 2's empty 5-seat table would fit them more tightly.
    const r = arrange(
      [round(1, 1), rect(2, 1), { ...rect(3, 2), seats: 5 }],
      [p('a', 'T1', 0, 2), p('b', 'T1', 1), p('c', 'T1', 2)],
    );
    expect(['a', 'b', 'c'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2']);
  });

  it('seated over, it’s the emptiest table in their own section', () => {
    // Every table is full, so someone has to go over: in their own section, not the other one.
    const tables = [{ ...round(1, 1), id: 'S1T1' }, { ...round(1, 2), id: 'S2T1' }];
    const r = arrange(tables, [p('a', 'S1T1', 0, 3), p('b', 'S1T1', 1), ...['w', 'x', 'y', 'z'].map((id, i) => p(id, 'S2T1', i))], { allowOver: true });
    expect(tableOf(r, 'b')).toBe('S1T1');
    expect(r.notes.join(' ')).toMatch(/over/);
  });

  it('an added resident fills a table that has people before opening an empty one', () => {
    const r = arrange([round(1), rect(2)], [p('a', 'T2', 0), p('b', 'T2', 1), p('c', 'T2', 2), p('new', null, null, 0, true)]);
    // Empty Table 1 isn't opened while Table 2 has room.
    expect(tableOf(r, 'new')).toBe('T2');
    expect(r.notes).toEqual(['new added at Table 2.']);
  });
});
