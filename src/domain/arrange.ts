// Seats everyone coming to a special event. Pure, so the rules are tested without a database.
//
// Rules, strongest first:
//   1. A party (a resident and their guests) sits at one table. Never split.
//   2. No table goes over its seats, unless the caller allows it (the manager said yes).
//   3. Daily tablemates (same everyday table at this meal) stay together. A group that no longer
//      fits its table moves to another table as a whole; it's split only if no table fits it.
//   4. No half-empty tables: a table at most half full is merged into tables that already have
//      people, its groups moving whole. The smaller table moves, so most people keep their table.
//   5. Everyone keeps their usual table, and their usual seat, when they can.
//   6. Guests sit beside their host.
// Everyone else (added residents, regulars without a seat) fills what's left, biggest party first.

export interface ArrangeTable {
  id: string;
  section: number;
  number: number;
  seats: number;
  /** For the notes; table numbers repeat across sections ("Table 1, Section 2"). Defaults to "Table n". */
  label?: string;
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
  const n = ps.map((p) => (p.guests ? `${p.name} (+${p.guests})` : p.name));
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
  const free = (t: ArrangeTable) => t.seats - total(at.get(t.id)!);
  const label = (t: ArrangeTable) => t.label ?? `Table ${t.number}`;
  // Notes that name a table are written at the end, so a group merged later shows where it ended up.
  const notes: (string | (() => string))[] = [];
  const tableOf = (p: Party) => tables.find((t) => at.get(t.id)!.includes(p))!;
  const people = (t: ArrangeTable) => total(at.get(t.id)!);

  /** The table with the least room that still fits `need`; same section as `near` first, then nearest number. */
  const bestFit = (need: number, near: ArrangeTable | null, skip?: string) =>
    tables
      .filter((t) => t.id !== skip && free(t) >= need)
      .sort((a, b) => {
        if (near) {
          const sa = a.section === near.section ? 0 : 1;
          const sb = b.section === near.section ? 0 : 1;
          if (sa !== sb) return sa - sb;
        }
        return free(a) - free(b) || (near ? Math.abs(a.number - near.number) - Math.abs(b.number - near.number) : 0) || a.section - b.section || a.number - b.number;
      })[0];

  // ---- Daily tablemate groups ----
  const groups = new Map<string, Party[]>();
  const loose: Party[] = [];
  for (const p of parties) {
    if (p.usualTable && byId.has(p.usualTable)) groups.set(p.usualTable, [...(groups.get(p.usualTable) ?? []), p]);
    else loose.push(p);
  }

  // Groups that still fit stay put; the rest are dealt with once we know where there's room.
  const overflowing: { home: ArrangeTable; ps: Party[] }[] = [];
  for (const [tid, ps] of groups) {
    const home = byId.get(tid)!;
    if (total(ps) <= home.seats) at.get(tid)!.push(...ps);
    else overflowing.push({ home, ps });
  }

  const queue: { p: Party; near: ArrangeTable | null }[] = [];
  overflowing.sort((a, b) => total(b.ps) - total(a.ps));
  for (const { home, ps } of overflowing) {
    // A group whose own table is still empty fits nowhere smaller, so look elsewhere first.
    const to = bestFit(total(ps), home, home.id);
    if (to) {
      at.get(to.id)!.push(...ps);
      notes.push(() => `${names(ps)} moved from ${label(home)} to ${label(tableOf(ps[0]!))} together: ${total(ps)} people don’t fit ${label(home)}’s ${home.seats} seats.`);
      continue;
    }
    // No table fits them all: keep as many as fit at home (biggest parties first), seat the rest nearby.
    const keep: Party[] = [];
    const moved: Party[] = [];
    for (const p of [...ps].sort((a, b) => size(b) - size(a))) (total(keep) + size(p) <= home.seats && free(home) - total(keep) >= size(p) ? keep : moved).push(p);
    at.get(home.id)!.push(...keep);
    // Keep the ones who move together if one table takes them all.
    const together = bestFit(total(moved), home);
    if (together) {
      at.get(together.id)!.push(...moved);
      notes.push(() => `${label(home)}’s group had to split (no table seats all ${total(ps)}): ${names(moved)} at ${label(tableOf(moved[0]!))}.`);
    } else {
      notes.push(`${label(home)}’s group had to split (no table seats all ${total(ps)}).`);
      for (const p of moved) queue.push({ p, near: home });
    }
  }

  /**
   * Empties tables that are at most half full, fewest people first, by moving their groups whole into
   * tables that already have people (same section first, then the fullest). All or nothing per table.
   */
  const pinnedTable = (t: ArrangeTable) => fixed.some((s) => s.tableId === t.id);
  const consolidate = () => {
    for (let changed = true; changed; ) {
      changed = false;
      const candidates = tables
        .filter((t) => people(t) > 0 && people(t) * 2 <= t.seats && !pinnedTable(t) && !at.get(t.id)!.some((p) => pinnedAt.has(p.residentId)))
        .sort((a, b) => people(a) - people(b) || b.section - a.section || b.number - a.number);
      for (const from of candidates) {
        // Daily tablemates move as one; anyone else on their own.
        const units = new Map<string, Party[]>();
        for (const p of at.get(from.id)!) {
          const k = p.usualTable ?? `p:${p.residentId}`;
          units.set(k, [...(units.get(k) ?? []), p]);
        }
        const coming = new Map<string, number>();
        const room = (t: ArrangeTable) => t.seats - people(t) - (coming.get(t.id) ?? 0);
        const plan: { ps: Party[]; to: ArrangeTable }[] = [];
        for (const ps of [...units.values()].sort((a, b) => total(b) - total(a))) {
          const to = tables
            .filter((t) => t.id !== from.id && people(t) > 0 && room(t) >= total(ps))
            .sort((a, b) => (a.section === from.section ? 0 : 1) - (b.section === from.section ? 0 : 1) || room(a) - room(b) || Math.abs(a.number - from.number) - Math.abs(b.number - from.number))[0];
          if (!to) break;
          coming.set(to.id, (coming.get(to.id) ?? 0) + total(ps));
          plan.push({ ps, to });
        }
        if (plan.length !== units.size) continue;
        at.set(from.id, []);
        for (const { ps, to } of plan) at.get(to.id)!.push(...ps);
        // Only people leaving their own table need a note; anyone else's note already says where they sit.
        const regulars = plan.map(({ ps, to }) => ({ ps: ps.filter((p) => p.usualTable === from.id), to })).filter((x) => x.ps.length);
        // Someone placed later may still need the table, so the reason is settled at the end.
        const joined = regulars.map(({ ps, to }) => `${names(ps)} joined ${label(to)}`).join('; ');
        if (regulars.length) notes.push(() => (people(from) ? `${joined}.` : `${joined} so ${label(from)} isn’t needed.`));
        changed = true;
        break;
      }
    }
  };
  consolidate();

  // ---- Everyone else, biggest party first ----
  for (const p of loose) queue.push({ p, near: null });
  queue.sort((a, b) => size(b.p) - size(a.p) || a.p.name.localeCompare(b.p.name));
  const unplaced: Party[] = [];
  for (const { p, near } of queue) {
    const to = bestFit(size(p), near);
    if (to) {
      at.get(to.id)!.push(p);
      notes.push(() => (!near || near.id !== tableOf(p).id ? `${names([p])} ${p.added ? 'added' : 'seated'} at ${label(tableOf(p))}.` : ''));
    } else unplaced.push(p);
  }
  consolidate();

  // ---- Over, only when allowed: the table with the most room left ----
  if (opts.allowOver) {
    for (const p of unplaced.splice(0)) {
      const to = [...tables].sort((a, b) => free(b) - free(a) || a.section - b.section || a.number - b.number)[0];
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
