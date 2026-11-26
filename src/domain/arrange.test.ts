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

  it('the party that brings guests moves; its tablemates keep their seats', () => {
    // Tim, Paul and Kim (Table 1, 4 seats) and Tim brings 2 guests: 5 people. Table 2 (6 seats) is free.
    const r = arrange([round(1), rect(2)], [p('tim', 'T1', 0, 2), p('paul', 'T1', 1), p('kim', 'T1', 2)]);
    expect(['tim', 'paul', 'kim'].map((id) => tableOf(r, id))).toEqual(['T2', 'T1', 'T1']);
    expect(where(r, 'paul')!.seat).toBe(1);
    expect(where(r, 'kim')!.seat).toBe(2);
    expect(r.notes[0]).toMatch(/tim \(\+2\) moved from Table 1 to Table 2/);
  });

  it('a party with guests that has to move takes an empty table rather than join residents', () => {
    const r = arrange([round(1), rect(2), round(3)], [p('tim', 'T1', 0, 2), p('paul', 'T1', 1), p('kim', 'T1', 2), ...['d', 'e', 'f'].map((id, i) => p(id, 'T2', i))]);
    expect(tableOf(r, 'tim')).toBe('T3');
    expect(['d', 'e', 'f'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2']);
  });

  it('a resident on their own joins residents, not someone else’s family', () => {
    // Table 1 has a host and 2 guests (1 seat left); Table 2 has 3 residents (3 left).
    const r = arrange([round(1), rect(2)], [p('a', 'T1', 0, 2), ...['d', 'e', 'f'].map((id, i) => p(id, 'T2', i)), p('new', null, null, 0, true)]);
    expect(tableOf(r, 'new')).toBe('T2');
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

  it('moves as few people as will do, keeping parties whole', () => {
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0, 1), p('b', 'T1', 1, 1), p('c', 'T1', 2)]);
    expect(r.unplaced).toEqual([]);
    expect(tableOf(r, 'c')).toBe('T1');
    expect([tableOf(r, 'a'), tableOf(r, 'b')].sort()).toEqual(['T1', 'T2']);
    for (const id of ['a', 'b', 'c']) expect(r.seats.filter((s) => s.residentId === id).every((s) => s.tableId === tableOf(r, id))).toBe(true);
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
    expect(tableOf(r, 'b')).toBe('T1'); // the only other table has a's guest, so b keeps their seat
  });

  it('a resident left alone by cancellations joins residents in their section', () => {
    // After cancellations Table 1 has 1 person and Table 2 has 2.
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T2', 0), p('c', 'T2', 2)]);
    expect(['a', 'b', 'c'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2']);
    expect(where(r, 'b')!.seat).toBe(0); // the group that stays keeps its seats
    expect(where(r, 'c')!.seat).toBe(2);
    expect(r.notes).toEqual(['a moved from Table 1 to join Table 2, so no one is at a near-empty table.']);
  });

  it('someone who usually sits alone stays put', () => {
    const r = arrange([{ ...round(1), usual: 1 }, round(2)], [p('a', 'T1', 0), p('b', 'T2', 0), p('c', 'T2', 2)]);
    expect(tableOf(r, 'a')).toBe('T1');
    expect(r.notes).toEqual([]);
  });

  it('half-empty is fine: only a third full or less is combined', () => {
    const r = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T1', 1), p('c', 'T2', 0), p('d', 'T2', 1)]);
    expect(r.notes).toEqual([]);
  });

  it('combines sparse tables into whatever fills a table best', () => {
    const five = { ...rect(3), seats: 5 };
    // 2 + 2 from two 6-tops: an empty 4-top beats either 6-top.
    const a = arrange([rect(1), rect(2), round(3)], [p('a', 'T1', 0), p('b', 'T1', 1), p('c', 'T2', 0), p('d', 'T2', 1)]);
    expect(['a', 'b', 'c', 'd'].map((id) => tableOf(a, id))).toEqual(['T3', 'T3', 'T3', 'T3']);
    // 2 + 3: an empty 5-top.
    const b = arrange([rect(1), rect(2), five], [p('a', 'T1', 0), p('b', 'T1', 1), p('c', 'T2', 0), p('d', 'T2', 1), p('e', 'T2', 2)]);
    expect(['a', 'b', 'c', 'd', 'e'].map((id) => tableOf(b, id))).toEqual(['T3', 'T3', 'T3', 'T3', 'T3']);
    // 1 + 3: the one joins the three at their 4-top.
    const c = arrange([round(1), round(2)], [p('a', 'T1', 0), p('b', 'T2', 0), p('c', 'T2', 1), p('d', 'T2', 2)]);
    expect(['a', 'b', 'c', 'd'].map((id) => tableOf(c, id))).toEqual(['T2', 'T2', 'T2', 'T2']);
    expect(where(c, 'b')!.seat).toBe(0);
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

  it('combines in their own section first, and crosses the room only when it must', () => {
    const t = (n: number, sec: number) => ({ ...round(n, sec), id: `S${sec}T${n}` });
    const near = arrange([t(1, 1), t(2, 1), t(1, 2)], [p('a', 'S1T1', 0), p('b', 'S1T2', 0), p('c', 'S1T2', 1), p('x', 'S2T1', 0), p('y', 'S2T1', 1), p('z', 'S2T1', 2)]);
    expect(tableOf(near, 'a')).toBe('S1T2'); // 3 of 4 here beats 4 of 4 across the room
    const far = arrange([t(1, 1), t(1, 2)], [p('a', 'S1T1', 0), p('b', 'S2T1', 0), p('c', 'S2T1', 1)]);
    expect(tableOf(far, 'a')).toBe('S2T1'); // no one else in section 1: company beats staying
  });

  it('a party that outgrows its table moves within its section, even if another section fits tighter', () => {
    // Section 1: Table 1 (4 seats, 5 coming) and Table 2 (6 seats, empty). Section 2's empty 5-seat table would fit them more tightly.
    const r = arrange(
      [round(1, 1), rect(2, 1), { ...rect(3, 2), seats: 5 }],
      [p('a', 'T1', 0, 2), p('b', 'T1', 1), p('c', 'T1', 2)],
    );
    expect(['a', 'b', 'c'].map((id) => tableOf(r, id))).toEqual(['T2', 'T1', 'T1']);
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

  it('a party with no table free moves residents out of one big enough, rather than squeezing in', () => {
    // A host and 5 guests (6) at a 4-top; the only 6-top has 3 residents, and the other 4-top has room for them.
    const r = arrange([round(1), rect(2), round(3)], [p('host', 'T1', 0, 5), ...['d', 'e', 'f'].map((id, i) => p(id, 'T2', i)), p('g', 'T3', 0)]);
    expect(tableOf(r, 'host')).toBe('T2');
    expect([1, 2, 3, 4, 5].every((g) => where(r, 'host', g)!.tableId === 'T2')).toBe(true);
    expect(r.unplaced).toEqual([]);
    // They go to tables with room, and stay together where they can.
    for (const id of ['d', 'e', 'f']) expect(tableOf(r, id)).not.toBe('T2');
    expect(r.seats.filter((s) => s.seat >= 4 && s.tableId !== 'T2')).toEqual([]);
    expect(r.notes.some((n) => /to make room for host \(\+5\)/.test(n))).toBe(true);
  });

  it('a host whose neighbours stay still sits with all their guests side by side', () => {
    // 6-top: the host at seat 0 brings 2; residents at seats 1 and 5 (both neighbours) stay.
    const r = arrange([rect(1)], [p('a', 'T1', 0, 2), p('b', 'T1', 1), p('c', 'T1', 5)]);
    const seats = [0, 1, 2].map((g) => where(r, 'a', g)!.seat).sort((x, y) => x - y);
    const run = seats.every((s) => seats.some((o) => o !== s && adjacent(s, o, 6)));
    expect(run).toBe(true);
    expect(new Set(r.seats.map((s) => s.seat)).size).toBe(5);
  });

  it('a seat-last table is used only when every other table is full', () => {
    const last = { ...round(1), last: true };
    // An empty seat-last table and a 4-top with 2: two added residents join the 4-top.
    const r = arrange([last, round(2)], [p('a', 'T2', 0), p('b', 'T2', 1), p('n1', null, null, 0, true), p('n2', null, null, 0, true)]);
    expect(['n1', 'n2'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2']);
    // A third has nowhere else to go.
    const r2 = arrange([last, round(2)], [p('a', 'T2', 0), p('b', 'T2', 1), p('n1', null, null, 0, true), p('n2', null, null, 0, true), p('n3', null, null, 0, true)]);
    expect(tableOf(r2, 'n3')).toBe('T1');
    // A party that outgrows its table doesn't move there while another table has room.
    const r3 = arrange([{ ...rect(1), last: true }, round(2), rect(3)], [p('h', 'T2', 0, 2), p('x', 'T2', 1), p('y', 'T2', 2)]);
    expect(tableOf(r3, 'h')).toBe('T3');
  });

  it('guests sit either side of their resident, not all on one side', () => {
    // Host at seat 0 of a 6-top with 2 guests: seats 5 and 1.
    const r = arrange([rect(1)], [p('a', 'T1', 0, 2)]);
    expect(where(r, 'a')!.seat).toBe(0);
    expect([where(r, 'a', 1)!.seat, where(r, 'a', 2)!.seat].sort()).toEqual([1, 5]);
    // A party that moved has the host in the middle of its seats.
    const m = arrange([round(1), rect(2)], [p('h', 'T1', 0, 2), p('x', 'T1', 1), p('y', 'T1', 2)]);
    const host = where(m, 'h')!.seat;
    const guests = [1, 2].map((g) => where(m, 'h', g)!.seat);
    expect(guests.every((g) => adjacent(g, host, 6))).toBe(true);
  });

  it('a closed table seats nobody; those whose seat it is move, in their section', () => {
    const shut = { ...round(1), closed: true };
    const r = arrange([shut, round(2), round(3, 2)], [p('a', 'T1', 0), p('b', 'T1', 1), p('c', 'T2', 0), p('n', null, null, 0, true)]);
    expect(['a', 'b', 'c', 'n'].map((id) => tableOf(r, id))).toEqual(['T2', 'T2', 'T2', 'T2']);
    expect(r.notes.join(' ')).toMatch(/a moved from Table 1 to Table 2: Table 1 is closed/);
    // Not even when it would mean going over.
    const over = arrange([shut, round(2)], [p('a', 'T2', 0), p('b', 'T2', 1), p('c', 'T2', 2), p('d', 'T2', 3), p('e', null, null, 0, true)], { allowOver: true });
    expect(tableOf(over, 'e')).toBe('T2');
    // A seat placed there by hand stays.
    const pinned = arrange([shut, round(2)], [p('a', 'T2', 0)], { fixed: [{ tableId: 'T1', seat: 2, residentId: 'a', guest: 0 }] });
    expect(pinned.seats.some((s) => s.residentId === 'a')).toBe(false);
  });

  it('a resident who keeps their seat stays put; tablemates move instead', () => {
    const keep = (x: Party): Party => ({ ...x, stays: true });
    // Kim keeps her seat and brings 2 guests to a 4-top she shares with two others: one of them moves, she stays.
    const r = arrange([round(1), rect(2)], [keep(p('kim', 'T1', 0, 2)), p('paul', 'T1', 1), p('tim', 'T1', 2)]);
    expect(where(r, 'kim')).toMatchObject({ tableId: 'T1', seat: 0 });
    expect(['paul', 'tim'].map((id) => tableOf(r, id)).sort()).toEqual(['T1', 'T2']);
    // Making room for a big party skips the table where someone keeps their seat.
    const m = arrange([rect(1), rect(2), round(3)], [keep(p('a', 'T1', 0)), p('b', 'T2', 0), p('big', null, null, 5, true)]);
    expect(where(m, 'a')).toMatchObject({ tableId: 'T1', seat: 0 });
    expect(tableOf(m, 'big')).toBe('T2');
    // A sparse table isn't emptied when its one resident keeps their seat.
    const s = arrange([{ ...rect(1), usual: 6 }, rect(2)], [keep(p('a', 'T1', 0)), p('b', 'T2', 0), p('c', 'T2', 1)]);
    expect(where(s, 'a')).toMatchObject({ tableId: 'T1', seat: 0 });
  });
});
