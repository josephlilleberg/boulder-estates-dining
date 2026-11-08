import type { DiningTable, Shape } from './model';
import type { SiteId } from './sites';
import { seatGeom } from './tables';

// Room geometry shared by Room Designer, Seating and the printed sheets.
// Units are "room units": each section is a 1040 × 800 room. Values and rules
// come from the mockup's fp / overlaps / arrange.

export const ROOM_W = 1040;
export const ROOM_H = 800;

/** Screen pixels per room unit for a container width: fills the card, within 0.45–0.74. */
export const roomScale = (width: number) => (width ? Math.max(0.45, Math.min(0.74, (width - 16) / ROOM_W)) : 0.74);

/** Drawn table size at rotation 0 (room units). Round tables are 92 across; rectangles 182 × 92. */
export const tableSize = (shape: Shape): [number, number] => (shape === 'round' ? [92, 92] : [182, 92]);

type Placed = Pick<DiningTable, 'shape' | 'rotation'>;

/** Half-width / half-height of a table including its seats and printed name labels. */
export function footprint(t: Placed): [number, number] {
  if (t.shape === 'round') return [107, 107];
  const r = ((t.rotation % 180) + 180) % 180;
  if (r === 0) return [153, 107];
  if (r === 90) return [107, 153];
  return [138, 138];
}

/** Seat centres and outward normals in room coordinates, in seat-index order. */
export function seatPoints(t: Pick<DiningTable, 'shape' | 'rotation' | 'x' | 'y'>) {
  const a = (t.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return seatGeom(t.shape).map(([dx, dy, nx, ny]) => ({
    x: t.x + dx * c - dy * s,
    y: t.y + dx * s + dy * c,
    nx: nx * c - ny * s,
    ny: nx * s + ny * c,
  }));
}

// ---- Editing limits ------------------------------------------------------------

/** A table centre stays this far inside the room so it can always be grabbed. */
export const clampX = (x: number) => Math.max(40, Math.min(ROOM_W - 40, x));
export const clampY = (y: number) => Math.max(40, Math.min(ROOM_H - 40, y));
export const DRAG_SNAP = 10;
export const NUDGE_STEP = 20;
export const snap = (v: number) => Math.round(v / DRAG_SNAP) * DRAG_SNAP;

// ---- Warnings ------------------------------------------------------------------

/** Tables whose seats bump into another table or a wall: id → message. */
export function overlapWarnings(tables: DiningTable[]): Map<string, string> {
  const out = new Map<string, string>();
  const SLACK = 6;
  tables.forEach((a, i) => {
    const fa = footprint(a);
    tables.forEach((b, j) => {
      if (j <= i || a.section !== b.section || a.layoutId !== b.layoutId) return;
      const fb = footprint(b);
      if (Math.abs(a.x - b.x) < fa[0] + fb[0] - SLACK && Math.abs(a.y - b.y) < fa[1] + fb[1] - SLACK) {
        out.set(a.id, `Too close to Table ${b.number}. Seats will bump.`);
        out.set(b.id, `Too close to Table ${a.number}. Seats will bump.`);
      }
    });
    if (!out.has(a.id) && (a.x - fa[0] < -SLACK || a.x + fa[0] > ROOM_W + SLACK || a.y - fa[1] < -SLACK || a.y + fa[1] > ROOM_H + SLACK)) {
      out.set(a.id, 'Seats run into the wall.');
    }
  });
  return out;
}

// ---- Placing new tables ----------------------------------------------------------

/** First free spot (scanning rows top-left to bottom-right) where a new table doesn't touch any other. */
export function freeSpot(existing: DiningTable[], shape: Shape): { x: number; y: number } {
  const fn = footprint({ shape, rotation: 0 });
  for (let y = 110; y <= 690; y += 20) {
    for (let x = 110; x <= 930; x += 20) {
      const clear = existing.every((o) => {
        const fo = footprint(o);
        return Math.abs(o.x - x) >= fo[0] + fn[0] || Math.abs(o.y - y) >= fo[1] + fn[1];
      });
      if (clear) return { x, y };
    }
  }
  return { x: 520, y: 400 };
}

// ---- Even out spacing ------------------------------------------------------------

/**
 * Per-section rules for "Even out spacing", keyed by table number. These are the
 * real room's quirks from the mockup: Boulder Estates Section 1 sits against a
 * wall on the left, so its left-hand tables line up on that wall.
 */
export interface ArrangeRules {
  align: 'even' | 'left';
  /** Hand nudges (room units, x only) applied after left alignment. */
  nudge?: Record<number, number>;
  /** Tables centred between the table on their left and the room's right-hand edge. */
  center?: number[];
  /** [moved, guide]: the first table takes the second's x, so they stand in one column. */
  match?: [number, number][];
}

const RULES: Record<string, ArrangeRules> = {
  'BE:1': { align: 'left', nudge: { 5: -46 }, center: [2, 4], match: [[1, 3], [2, 4]] },
};

export const arrangeRules = (site: SiteId, section: number): ArrangeRules => RULES[`${site}:${section}`] ?? { align: 'even' };

/**
 * Rows are read from the room as it is: tables whose centres are within half a
 * table of the row's first table share a row, ordered left to right. (The mockup
 * hard-coded rows by table number, which would ignore any table added later.)
 */
export function rowsOf(tables: DiningTable[]): DiningTable[][] {
  const ROW_GAP = 107;
  const rows: DiningTable[][] = [];
  for (const t of [...tables].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && t.y - row[0]!.y < ROW_GAP) row.push(t);
    else rows.push([t]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

/**
 * Keep each table in its row (and column), then spread the free space evenly
 * across and down the room. Returns new centres for every table in `tables`
 * (one section).
 */
export function arrange(tables: DiningTable[], rules: ArrangeRules): Map<string, { x: number; y: number }> {
  const R = rowsOf(tables);
  const pos = new Map<string, { x: number; y: number }>();
  if (!R.length) return pos;
  const fp = footprint;
  const P = (t: DiningTable) => pos.get(t.id)!;

  // Columns: consecutive rows with the same number of tables share column widths.
  let i = 0;
  while (i < R.length) {
    let j = i;
    while (j + 1 < R.length && R[j + 1]!.length === R[i]!.length) j++;
    const n = R[i]!.length;
    const cw: number[] = [];
    for (let c = 0; c < n; c++) {
      let m = 0;
      for (let k = i; k <= j; k++) m = Math.max(m, fp(R[k]![c]!)[0]);
      cw.push(m);
    }
    const gap = (ROOM_W - 2 * cw.reduce((a, b) => a + b, 0)) / (n + 1);
    let x = gap;
    const cx = cw.map((w) => {
      const c = x + w;
      x += 2 * w + gap;
      return c;
    });
    for (let k = i; k <= j; k++) R[k]!.forEach((t, c) => pos.set(t.id, { x: Math.round(cx[c]!), y: 0 }));
    i = j + 1;
  }

  if (rules.align === 'left') {
    const M = Math.min(...R.map((r) => P(r[0]!).x - fp(r[0]!)[0]));
    R.forEach((r) => (P(r[0]!).x = Math.round(M + fp(r[0]!)[0])));
    if (rules.nudge) R.forEach((r) => r.forEach((t) => (P(t).x += rules.nudge![t.number] ?? 0)));
  }

  if (rules.center) {
    const centred = new Set(rules.center);
    const others = R.flatMap((r) => r.filter((t) => !centred.has(t.number)));
    if (others.length) {
      const E = Math.max(...others.map((t) => P(t).x + fp(t)[0]));
      R.forEach((r) =>
        r.forEach((t, c) => {
          if (c > 0 && centred.has(t.number)) {
            const L = r[c - 1]!;
            P(t).x = Math.round((P(L).x + fp(L)[0] + E) / 2);
          }
        }),
      );
    }
  }

  if (rules.match) {
    for (const [a, b] of rules.match) {
      const A = tables.find((t) => t.number === a);
      const B = tables.find((t) => t.number === b);
      if (A && B) P(A).x = P(B).x;
    }
  }

  // Rows: the smallest gap that keeps overlapping columns apart, then share the slack.
  const half = R.map((r) => Math.max(...r.map((t) => fp(t)[1])));
  const d: number[] = [];
  for (let k = 0; k + 1 < R.length; k++) {
    let m = 0;
    for (const a of R[k]!) {
      for (const b of R[k + 1]!) {
        const fa = fp(a);
        const fb = fp(b);
        if (Math.abs(P(a).x - P(b).x) < fa[0] + fb[0]) m = Math.max(m, fa[1] + fb[1]);
      }
    }
    d.push(m || half[k]! + half[k + 1]!);
  }
  const y0 = half[0]!;
  const yN = ROOM_H - half[half.length - 1]!;
  const need = d.reduce((a, b) => a + b, 0);
  const extra = yN - y0 - need;
  const e = Math.max(extra, 0) / (R.length + 1);
  const f = extra < 0 ? (yN - y0) / need : 1;
  let y = y0 + e;
  R.forEach((r, k) => {
    r.forEach((t) => (P(t).y = Math.round(y)));
    if (k < d.length) y += d[k]! * f + e;
  });
  return pos;
}

// ---- Counts ----------------------------------------------------------------------

export function sectionSummary(tables: DiningTable[]) {
  const round = tables.filter((t) => t.shape === 'round').length;
  const rect = tables.length - round;
  return { tables: tables.length, round, rect, seats: tables.reduce((n, t) => n + seatGeom(t.shape).length, 0) };
}
