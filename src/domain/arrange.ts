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
//   6. Sparse tables are combined: a table cancellations left a third full or less (1 of 4,
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
  const unplaced: Party[] = [];
  for (const { p, from } of queue) {
    const to = place([p], from);
    if (!to) {
      unplaced.push(p);
      continue;
    }
    at.get(to.id)!.push(p);
    if (from) notes.push(() => `${names([p])} moved from ${label(from)} to ${label(tableOf(p))}: ${label(from)} has ${from.seats} seats.`);
    else notes.push(() => `${names([p])} ${p.added ? 'added' : 'seated'} at ${label(tableOf(p))}.`);
  }

  // ---- Sparse tables (rule 6) ----
  // A table takes part in one combining at most, so nobody is moved twice.
  const settled = new Set<string>();
  const residentsOnly = (t: ArrangeTable) => people(t) > 0 && !withGuests(at.get(t.id)!) && !pinnedTable(t) && !settled.has(t.id);
  const sparse = (t: ArrangeTable) => residentsOnly(t) && people(t) * 3 <= t.seats && (t.usual ?? t.seats) * 3 > t.seats;
  for (;;) {
    type Option = { from: ArrangeTable[]; to: ArrangeTable; away: number; fill: number; moved: number };
    const options: Option[] = [];
    for (const a of tables.filter(sparse)) {
      for (const b of tables.filter((t) => t.id !== a.id && residentsOnly(t))) {
        const n = people(a) + people(b);
        const same = a.section === b.section ? 0 : 1;
        // They join b's table...
        if (free(b) >= people(a)) options.push({ from: [a], to: b, away: same, fill: n / b.seats, moved: people(a) });
        // ...or both go to an empty table they fill better.
        for (const e of tables.filter((t) => people(t) === 0 && t.seats >= n))
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
      const to = [...tables].sort((a, b) => mine(a) - mine(b) || free(b) - free(a) || a.section - b.section || a.number - b.number)[0];
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
  const hosts = new Map<Party, number>();
  for (const p of staying) {
    if (taken.has(p.usualSeat!)) continue;
    take(p.usualSeat!, p, 0);
    hosts.set(p, p.usualSeat!);
  }
  // Bigger parties first, so their guests get the neighbouring seats.
  for (const [p, host] of [...hosts].sort((a, b) => b[0].guests - a[0].guests)) guestsBeside(p, host);

  for (const p of [...ps].filter((x) => !hosts.has(x) && !pinned.has(x)).sort((a, b) => size(b) - size(a))) {
    const start = runStart(n, taken, size(p));
    const host = start ?? nearestFree(0);
    if (host < 0) {
      take(extra++, p, 0);
      guestsBeside(p, extra - 1);
      continue;
    }
    take(host, p, 0);
    if (start !== null) for (let g = 1; g <= p.guests; g++) take((host + g) % n, p, g);
    else guestsBeside(p, host);
  }
  return out;
}

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
