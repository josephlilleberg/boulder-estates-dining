// Seats everyone coming to a special event. Pure, so the rules are tested without a database.
//
// Rules, strongest first:
//   1. A party (a resident and their guests) sits at one table. Never split. Relatives come in as
//      one party (see planSeats), so a family sits side by side at one table too.
//   2. No table goes over its seats, unless the caller allows it (the manager said yes).
//   3. Everyone keeps their own seat; else their own table; else their own section. Nobody is
//      sent across the room while their section has room.
//   4. A party that no longer fits its table (guests, family) is the one that moves, to a table
//      with room in its section; the tablemates keep their seats.
//   5. Whoever moves sits with residents like themselves: a resident on their own joins other
//      residents, not someone else's family; a party with guests takes a table of its own if
//      there is one.
//   6. A table marked "seat last" is used only when every other table is full: nobody is moved
//      or added there while another table has room (those whose own seat is there keep it).
//   7. Sparse tables are combined: a table cancellations left a third full or less (1 of 4,
//      2 of 6) joins residents elsewhere, in its section first, choosing whatever fills a table
//      best (2 + 2 at a 4-top, 2 + 3 at a 5-top). A table that's usually that empty (someone who
//      sits alone) is left as it is, and we don't try to use fewer tables otherwise.
// Everyone else (added residents, regulars without a seat) fills what's left, biggest party first.

export interface ArrangeTable {
  id: string;
  section: number;
  number: number;
  seats: number;
  /** For the notes; table numbers repeat across sections ("Table 1, Section 2"). Defaults to "Table n". */
  label?: string;
  /** Residents with an everyday seat here at this meal; a table usually this empty isn't "sparse". Defaults to full. */
  usual?: number;
  /** Seat last: used only when no other table has room. */
  last?: boolean;
}

export interface Party {
  residentId: string;
  /** For the notes: "Tim A." */
  name: string;
  guests: number;
  /** Their everyday table and seat at this meal, if that table is open for the event. */
  usualTable: string | null;
  usualSeat: number | null;
  /** Doesn't usually come (added to the event). */
  added: boolean;
  /** For the notes, in place of "name (+guests)": a family seated as one party ("X A. and Y A."). */
  label?: string;
}

export interface Placed {
  tableId: string;
  seat: number;
  residentId: string;
  guest: number;
}

export interface ArrangeResult {
  seats: Placed[];
  /** Plain-language reasons for every change from the everyday seating. */
  notes: string[];
  /** Parties that fit nowhere (only when over isn't allowed). */
  unplaced: Party[];
}

const size = (p: Party) => 1 + p.guests;
const total = (ps: Party[]) => ps.reduce((n, p) => n + size(p), 0);

export function names(ps: Party[]): string {
  const n = ps.map((p) => p.label ?? (p.guests ? `${p.name} (+${p.guests})` : p.name));
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

export interface ArrangeOptions {
  allowOver?: boolean;
  /** Seats placed by hand (pinned). Their parties stay at that table; everyone else is arranged around them. */
  fixed?: Placed[];
}

/** Lays everyone out. The result's seats are the new placements only (pinned seats aren't repeated). */
export function arrange(tables: ArrangeTable[], parties: Party[], opts: ArrangeOptions = {}): ArrangeResult {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const at = new Map<string, Party[]>(tables.map((t) => [t.id, []]));
  const fixed = (opts.fixed ?? []).filter((s) => byId.has(s.tableId));
  // A pinned party's table: where the resident sits, else where one of their guests does.
  const pinnedAt = new Map<string, string>();
  for (const s of [...fixed].sort((a, b) => a.guest - b.guest)) if (!pinnedAt.has(s.residentId)) pinnedAt.set(s.residentId, s.tableId);
  for (const p of parties) {
    const tid = pinnedAt.get(p.residentId);
    if (tid) at.get(tid)!.push(p);
  }
  parties = parties.filter((p) => !pinnedAt.has(p.residentId));
  const people = (t: ArrangeTable) => total(at.get(t.id)!);
  const free = (t: ArrangeTable) => t.seats - people(t);
  const label = (t: ArrangeTable) => t.label ?? `Table ${t.number}`;
  const withGuests = (ps: Party[]) => ps.some((p) => p.guests > 0);
  const pinnedTable = (t: ArrangeTable) => fixed.some((s) => s.tableId === t.id);
  const last = (t: ArrangeTable) => (t.last ? 1 : 0);
  // Notes that name a table are written at the end, so a group moved later shows where it ended up.
  const notes: (string | (() => string))[] = [];
  const tableOf = (p: Party) => tables.find((t) => at.get(t.id)!.includes(p))!;

  /**
   * Where a party goes when it can't stay home: its section first; then a table that suits it
   * (a resident on their own joins residents, a party with guests takes an empty table); then the
   * table it fills best; then the nearest.
   */
  const place = (ps: Party[], near: ArrangeTable | null) => {
    const need = total(ps);
    const mixed = (t: ArrangeTable) => (people(t) > 0 && (withGuests(ps) || withGuests(at.get(t.id)!)) ? 1 : 0);
    const away = (t: ArrangeTable) => (near && t.section !== near.section ? 1 : 0);
    return tables
      .filter((t) => free(t) >= need)
      .sort(
        (a, b) =>
          last(a) - last(b) ||
          away(a) - away(b) ||
          mixed(a) - mixed(b) ||
          free(a) - free(b) ||
          (near ? Math.abs(a.number - near.number) - Math.abs(b.number - near.number) : 0) ||
          a.section - b.section ||
          a.number - b.number,
      )[0];
  };

  // ---- Everyone with a seat at this meal starts there ----
  const home = new Map<string, Party[]>();
  const loose: Party[] = [];
  for (const p of parties) {
    if (p.usualTable && byId.has(p.usualTable)) home.set(p.usualTable, [...(home.get(p.usualTable) ?? []), p]);
    else loose.push(p);
  }

  // A table that's over: the parties that brought people move (rule 4), as few people as will do.
  const queue: { p: Party; from: ArrangeTable | null }[] = [];
  for (const [tid, ps] of home) {
    const t = byId.get(tid)!;
    const stay = [...ps];
    while (total(stay) > free(t)) {
      const over = total(stay) - free(t);
      // Parties with guests first; only if that's not enough, residents too (added ones before regulars).
      const pool = withGuests(stay) ? stay.filter((p) => p.guests > 0) : [...stay].sort((a, b) => Number(b.added) - Number(a.added));
      const enough = pool.filter((p) => size(p) >= over).sort((a, b) => size(a) - size(b))[0];
      const go = enough ?? [...pool].sort((a, b) => size(b) - size(a))[0]!;
      stay.splice(stay.indexOf(go), 1);
      queue.push({ p: go, from: t });
    }
    at.get(tid)!.push(...stay);
  }

  // ---- Those who moved, then everyone else, biggest party first ----
  for (const p of loose) queue.push({ p, from: null });
  queue.sort((a, b) => size(b.p) - size(a.p) || Number(!a.from) - Number(!b.from) || a.p.name.localeCompare(b.p.name));
  /**
   * No table has room for a party: residents sitting on their own give up their seats at a table
   * big enough (its section first, the smallest such table, as few of them as will do) and move,
   * together if a table has room for them all, else each like anyone who moves. A party is never squeezed in while that works.
   */
  const makeRoom = (p: Party, near: ArrangeTable | null) => {
    const need = size(p);
    const away = (t: ArrangeTable) => (near && t.section !== near.section ? 1 : 0);
    const candidates = tables
      .filter((t) => t.seats >= need && !pinnedTable(t) && !withGuests(at.get(t.id)!))
      .sort(
        (a, b) =>
          last(a) - last(b) ||
          away(a) - away(b) ||
          a.seats - b.seats ||
          people(a) - people(b) ||
          (near ? Math.abs(a.number - near.number) - Math.abs(b.number - near.number) : 0) ||
          a.section - b.section ||
          a.number - b.number,
      );
    for (const t of candidates) {
      const before = new Map([...at].map(([k, v]) => [k, [...v]]));
      const here = at.get(t.id)!;
      // Who gives up their seat: anyone not at their own table first, then those added, then regulars.
      const order = [...here].sort((a, b) => Number(a.usualTable === t.id) - Number(b.usualTable === t.id) || Number(b.added) - Number(a.added) || a.name.localeCompare(b.name));
      const leave: Party[] = [];
      while (free(t) < need) {
        const x = order.shift()!;
        here.splice(here.indexOf(x), 1);
        leave.push(x);
      }
      here.push(p);
      // Tablemates who give up their seats move together if a table has room for them all.
      const together = leave.length > 1 ? place(leave, t) : undefined;
      if (together) at.get(together.id)!.push(...leave);
      const dests = together
        ? leave.map(() => together)
        : leave.map((x) => {
            const d = place([x], t);
            if (d) at.get(d.id)!.push(x);
            return d;
          });
      if (dests.every(Boolean)) return { to: t, moved: leave };
      for (const [k, v] of before) at.set(k, v);
    }
    return null;
  };

  const unplaced: Party[] = [];
  for (const { p, from } of queue) {
    let to = place([p], from);
    let made: Party[] = [];
    if (to) at.get(to.id)!.push(p);
    else {
      const room = makeRoom(p, from);
      if (!room) {
        unplaced.push(p);
        continue;
      }
      to = room.to;
      made = room.moved;
    }
    if (from) notes.push(() => `${names([p])} moved from ${label(from)} to ${label(tableOf(p))}: ${label(from)} has ${from.seats} seats.`);
    else notes.push(() => `${names([p])} ${p.added ? 'added' : 'seated'} at ${label(tableOf(p))}.`);
    const into = to;
    // One line per table they went to: "A, B and C moved from Table 2 to Table 1 to make room for X (+5)."
    if (made.length)
      notes.push(() =>
        [...new Set(made.map(tableOf))]
          .filter((d) => d !== into)
          .map((d) => `${names(made.filter((x) => tableOf(x) === d))} moved from ${label(into)} to ${label(d)} to make room for ${names([p])}.`)
          .join(' '),
      );
  }

  // ---- Sparse tables (rule 7) ----
  // A table takes part in one combining at most, so nobody is moved twice.
  const settled = new Set<string>();
  const residentsOnly = (t: ArrangeTable) => people(t) > 0 && !withGuests(at.get(t.id)!) && !pinnedTable(t) && !settled.has(t.id);
  const sparse = (t: ArrangeTable) => residentsOnly(t) && people(t) * 3 <= t.seats && (t.usual ?? t.seats) * 3 > t.seats;
  for (;;) {
    type Option = { from: ArrangeTable[]; to: ArrangeTable; away: number; fill: number; moved: number };
    const options: Option[] = [];
    for (const a of tables.filter(sparse)) {
      for (const b of tables.filter((t) => t.id !== a.id && residentsOnly(t) && !t.last)) {
        const n = people(a) + people(b);
        const same = a.section === b.section ? 0 : 1;
        // They join b's table...
        if (free(b) >= people(a)) options.push({ from: [a], to: b, away: same, fill: n / b.seats, moved: people(a) });
        // ...or both go to an empty table they fill better.
        for (const e of tables.filter((t) => people(t) === 0 && t.seats >= n && !t.last))
          options.push({ from: [a, b], to: e, away: e.section === a.section && e.section === b.section ? 0 : 1, fill: n / e.seats, moved: n });
      }
    }
    const best = options.sort((x, y) => x.away - y.away || y.fill - x.fill || x.moved - y.moved)[0];
    if (!best) break;
    const moving = best.from.map((t) => ({ t, ps: at.get(t.id)! }));
    for (const { t } of moving) at.set(t.id, []);
    for (const { ps } of moving) at.get(best.to.id)!.push(...ps);
    for (const t of [...best.from, best.to]) settled.add(t.id);
    const to = best.to;
    const why = 'so no one is at a near-empty table';
    notes.push(
      moving.length === 1
        ? `${names(moving[0]!.ps)} moved from ${label(moving[0]!.t)} to join ${label(to)}, ${why}.`
        : `${moving.map(({ t, ps }) => `${names(ps)} (${label(t)})`).join(' and ')} sit together at ${label(to)}, ${why}.`,
    );
  }

  // ---- Over, only when allowed: the table with the most room left ----
  if (opts.allowOver) {
    for (const p of unplaced.splice(0)) {
      // The table with the most room left, in their own section first.
      const sec = p.usualTable ? byId.get(p.usualTable)?.section : undefined;
      const mine = (t: ArrangeTable) => (t.section === sec ? 0 : 1);
      const to = [...tables].sort((a, b) => last(a) - last(b) || mine(a) - mine(b) || free(b) - free(a) || a.section - b.section || a.number - b.number)[0];
      if (!to) {
        unplaced.push(p);
        continue;
      }
      at.get(to.id)!.push(p);
      notes.push(`${names([p])} at ${label(to)}, which is ${-free(to)} over.`);
    }
  }

  return {
    seats: tables.flatMap((t) =>
      seatTable(
        t,
        at.get(t.id)!,
        fixed.filter((s) => s.tableId === t.id),
      ),
    ),
    notes: notes.map((n) => (typeof n === 'string' ? n : n())).filter(Boolean),
    unplaced,
  };
}

/**
 * Seat numbers go round the table in order, so neighbours are ±1 (wrapping). People who stayed
 * at their usual table keep their usual seat; guests take the free seats nearest their host;
 * a party that moved takes a run of seats side by side. Past the table's seats: extra places.
 */
function seatTable(t: ArrangeTable, ps: Party[], fixed: Placed[]): Placed[] {
  const n = t.seats;
  const taken = new Set<number>(fixed.map((s) => s.seat));
  const out: Placed[] = [];
  let extra = Math.max(n, ...fixed.map((s) => s.seat + 1));
  const take = (seat: number, p: Party, guest: number) => {
    taken.add(seat);
    out.push({ tableId: t.id, seat, residentId: p.residentId, guest });
  };
  const dist = (a: number, b: number) => Math.min((a - b + n) % n, (b - a + n) % n);
  const nearestFree = (from: number) => {
    let best = -1;
    for (let s = 0; s < n; s++) if (!taken.has(s) && (best < 0 || dist(s, from) < dist(best, from))) best = s;
    return best;
  };
  const guestsBeside = (p: Party, host: number) => {
    for (let g = 1; g <= p.guests; g++) {
      const s = host < n ? nearestFree(host) : -1;
      take(s >= 0 ? s : extra++, p, g);
    }
  };

  // Pinned parties first: anyone in them not yet seated (a guest added later) goes beside them.
  const pinned = new Set<Party>();
  for (const p of ps) {
    const mine = fixed.filter((s) => s.residentId === p.residentId);
    if (!mine.length) continue;
    pinned.add(p);
    const anchor = (mine.find((s) => s.guest === 0) ?? mine[0]!).seat;
    for (let g = 0; g <= p.guests; g++) {
      if (mine.some((s) => s.guest === g)) continue;
      const s = anchor < n ? nearestFree(anchor) : -1;
      take(s >= 0 ? s : extra++, p, g);
    }
  }

  const staying = ps.filter((p) => !pinned.has(p) && p.usualTable === t.id && p.usualSeat !== null && p.usualSeat < n);
  // Seats the residents staying on their own will want back, so a party sits elsewhere if it can.
  const wanted = new Set(staying.filter((p) => p.guests === 0).map((p) => p.usualSeat!));

  // A party with guests sits side by side with the host in the middle, guests either side, biggest
  // party first: around the host's own seat when they're home, else where it takes the fewest seats
  // others want.
  for (const p of ps.filter((x) => !pinned.has(x) && x.guests > 0).sort((a, b) => size(b) - size(a))) {
    const anchor = staying.includes(p) && !taken.has(p.usualSeat!) ? p.usualSeat! : null;
    const start = bestRun(n, taken, size(p), anchor, wanted);
    if (start === null) {
      const host = anchor ?? nearestFree(0);
      const h = host >= 0 ? host : extra++;
      take(h, p, 0);
      guestsBeside(p, h);
      continue;
    }
    const run = Array.from({ length: size(p) }, (_, k) => (start + k) % n);
    const host = anchor !== null && run.includes(anchor) ? anchor : run[mid(run.length)]!;
    take(host, p, 0);
    run.filter((x) => x !== host).forEach((x, g) => take(x, p, g + 1));
  }

  // Residents on their own: their own seat if it's free, else the nearest free one.
  const alone = ps.filter((p) => !pinned.has(p) && p.guests === 0);
  const later: Party[] = [];
  for (const p of alone) {
    if (staying.includes(p) && !taken.has(p.usualSeat!)) take(p.usualSeat!, p, 0);
    else later.push(p);
  }
  for (const p of later) {
    const from = staying.includes(p) ? p.usualSeat! : null;
    const s = from !== null ? nearestFree(from) : runStart(n, taken, 1) ?? -1;
    take(s >= 0 ? s : extra++, p, 0);
  }
  return out;
}

/** The middle of a run of seats (the left of the two middles when even). */
const mid = (len: number) => Math.floor((len - 1) / 2);

/**
 * Where `len` free seats in a row (wrapping) should start: one that includes `anchor` (the host's
 * own seat) if any does, with the anchor as near the middle as can be (guests either side), then
 * one covering the fewest `wanted` seats, then the nearest the anchor.
 */
function bestRun(n: number, taken: Set<number>, len: number, anchor: number | null, wanted: Set<number>): number | null {
  if (len > n) return null;
  const dist = (a: number, b: number) => Math.min((a - b + n) % n, (b - a + n) % n);
  let best: { s: number; key: number[] } | null = null;
  for (let s = 0; s < n; s++) {
    const run = Array.from({ length: len }, (_, k) => (s + k) % n);
    if (run.some((x) => taken.has(x))) continue;
    const off = anchor !== null && run.includes(anchor) ? Math.abs(run.indexOf(anchor) - mid(len)) : 0;
    const key = [anchor !== null && !run.includes(anchor) ? 1 : 0, off, run.filter((x) => wanted.has(x)).length, anchor !== null ? Math.min(...run.map((x) => dist(x, anchor))) : 0];
    if (!best || before(key, best.key)) best = { s, key };
  }
  return best?.s ?? null;
}

/** a sorts before b, comparing entry by entry. */
const before = (a: number[], b: number[]) => {
  const i = a.findIndex((v, k) => v !== b[k]);
  return i >= 0 && a[i]! < b[i]!;
};

/** First seat of `len` free seats in a row (wrapping), or null. */
function runStart(n: number, taken: Set<number>, len: number): number | null {
  if (len > n) return null;
  for (let s = 0; s < n; s++) {
    let ok = true;
    for (let k = 0; k < len && ok; k++) ok = !taken.has((s + k) % n);
    if (ok) return s;
  }
  return null;
}
