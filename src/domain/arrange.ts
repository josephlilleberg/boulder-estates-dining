// Seats everyone coming to a special event. Pure, so the rules are tested without a database.
//
// Rules, strongest first:
//   1. A party (a resident and their guests) sits at one table. Never split.
//   2. No table goes over its seats, unless the caller allows it (the manager said yes).
//   3. Daily tablemates (same everyday table at this meal) stay together. A group that no longer
//      fits its table moves to another table as a whole; it's split only if no table fits it.
//   4. Everyone keeps their usual table, and their usual seat, when they can.
//   5. Guests sit beside their host.
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

export function arrange(tables: ArrangeTable[], parties: Party[], opts: { allowOver?: boolean } = {}): ArrangeResult {
  const byId = new Map(tables.map((t) => [t.id, t]));
  const at = new Map<string, Party[]>(tables.map((t) => [t.id, []]));
  const free = (t: ArrangeTable) => t.seats - total(at.get(t.id)!);
  const label = (t: ArrangeTable) => t.label ?? `Table ${t.number}`;
  const notes: string[] = [];

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
      notes.push(`${names(ps)} moved from ${label(home)} to ${label(to)} together: ${total(ps)} people don’t fit ${label(home)}’s ${home.seats} seats.`);
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
      notes.push(`${label(home)}’s group had to split (no table seats all ${total(ps)}): ${names(moved)} at ${label(together)}.`);
    } else {
      notes.push(`${label(home)}’s group had to split (no table seats all ${total(ps)}).`);
      for (const p of moved) queue.push({ p, near: home });
    }
  }

  // ---- Everyone else, biggest party first ----
  for (const p of loose) queue.push({ p, near: null });
  queue.sort((a, b) => size(b.p) - size(a.p) || a.p.name.localeCompare(b.p.name));
  const unplaced: Party[] = [];
  for (const { p, near } of queue) {
    const to = bestFit(size(p), near);
    if (to) {
      at.get(to.id)!.push(p);
      if (!near || near.id !== to.id) notes.push(`${names([p])} ${p.added ? 'added' : 'seated'} at ${label(to)}.`);
    } else unplaced.push(p);
  }

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

  return { seats: tables.flatMap((t) => seatTable(t, at.get(t.id)!)), notes, unplaced };
}

/**
 * Seat numbers go round the table in order, so neighbours are ±1 (wrapping). People who stayed
 * at their usual table keep their usual seat; guests take the free seats nearest their host;
 * a party that moved takes a run of seats side by side. Past the table's seats: extra places.
 */
function seatTable(t: ArrangeTable, ps: Party[]): Placed[] {
  const n = t.seats;
  const taken = new Set<number>();
  const out: Placed[] = [];
  let extra = n;
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

  const staying = ps.filter((p) => p.usualTable === t.id && p.usualSeat !== null && p.usualSeat < n);
  const hosts = new Map<Party, number>();
  for (const p of staying) {
    if (taken.has(p.usualSeat!)) continue;
    take(p.usualSeat!, p, 0);
    hosts.set(p, p.usualSeat!);
  }
  // Fewest free neighbours first, so a guest isn't pushed away by someone with more room.
  for (const [p, host] of [...hosts].sort((a, b) => b[0].guests - a[0].guests)) guestsBeside(p, host);

  for (const p of [...ps].filter((x) => !hosts.has(x)).sort((a, b) => size(b) - size(a))) {
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
