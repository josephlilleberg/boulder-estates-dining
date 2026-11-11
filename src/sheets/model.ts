import type { Beverage, Chair, DiningTable, MealPrefs, Resident } from '../domain/model';
import { hasAmount, pouredInto, pouredTogether, shortName } from '../domain/model';
import { footprint, rowsOf } from '../domain/room';
import type { OpenSection } from '../domain/sites';
import { seatGeom } from '../domain/tables';

// The printed sheets as plain data: positions in page pixels (96 per inch), ready
// for SheetPage to draw. Ported from the mockup's serverFit / printRoom /
// setupPlan; numbers match it so View, Print preview and paper agree.

export type Occupant = (tableId: string, seat: number) => Resident | null;

// ---- Pages -------------------------------------------------------------------------

export type Paper = 'letter' | 'tabloid';
/** Landscape page size in CSS pixels: Letter 11 × 8.5 in, 11 × 17 drawn as 17 × 11 in. */
export const PAGE: Record<Paper, { w: number; h: number; name: string }> = {
  letter: { w: 1056, h: 816, name: 'Letter' },
  tabloid: { w: 1632, h: 1056, name: '11 × 17' },
};

/** Scale that fits a whole page inside a w × h box (content size, no padding), never above 100%. */
export const fitPage = (w: number, h: number, pageW: number, pageH: number) => Math.max(0.1, Math.min(1, Math.floor(Math.min(w / pageW, h / pageH) * 100) / 100));

export const printedDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// ---- Shared geometry ------------------------------------------------------------------

/** Text faces the table; a label that would read upside down flips. */
export function edgeAngle(nx: number, ny: number): number {
  let a = Math.round((Math.atan2(ny, nx) * 180) / Math.PI + 90);
  a = ((((a + 180) % 360) + 360) % 360) - 180;
  if (a > 90 || a < -90) a = a > 0 ? a - 180 : a + 180;
  return a;
}

/** A rectangle centred at (cx, cy), half-sizes hw × hh, turned `ang` degrees. */
export interface RotBox {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  ang: number;
}

export function corners(r: RotBox): [number, number][] {
  const a = (r.ang * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const v = [-Math.sin(a), Math.cos(a)];
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([p, q]) => [r.cx + p! * r.hw * u[0]! + q! * r.hh * v[0]!, r.cy + p! * r.hw * u[1]! + q! * r.hh * v[1]!]);
}

/** Smallest push (direction + depth) that separates two turned boxes with `gap` to spare; null if already apart. */
export function separation(A: RotBox, B: RotBox, gap: number): { o: number; v: [number, number] } | null {
  const PA = corners(A);
  const PB = corners(B);
  let best: { o: number; v: [number, number] } | null = null;
  for (const P of [PA, PB]) {
    for (let i = 0; i < 2; i++) {
      const e = [P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1]];
      const l = Math.hypot(e[0]!, e[1]!) || 1;
      const ax: [number, number] = [-e[1]! / l, e[0]! / l];
      const pr = (Q: [number, number][]) => {
        const d = Q.map((q) => q[0] * ax[0] + q[1] * ax[1]);
        return [Math.min(...d), Math.max(...d)] as const;
      };
      const ra = pr(PA);
      const rb = pr(PB);
      const o = Math.min(ra[1] - rb[0], rb[1] - ra[0]) + gap;
      if (o <= 0) return null;
      if (!best || o < best.o) best = { o, v: ra[0] + ra[1] < rb[0] + rb[1] ? [-ax[0], -ax[1]] : ax };
    }
  }
  return best;
}

const prefsOf = (r: Resident, meal: string) => r.prefs[meal as never] as MealPrefs | undefined;

// ---- Server sheet ---------------------------------------------------------------------

export interface Pill {
  cap: string;
  bg: string;
  color: string;
  /** Half glass of milk: a dark ½ tab in front. */
  half: boolean;
  /** The cup it's served in, named in a dark band under the drink. */
  cup: string;
}

/** Short names for the cup band on server sheets. */
const CUP_TAG: Record<string, string> = { 'To-go cup': 'To-go', 'Milk pitcher': 'Pitcher', 'Juice glass': 'Juice glass', Glass: 'Glass', Mug: 'Mug' };
export const cupTag = (drinkware: string) => CUP_TAG[drinkware] ?? drinkware;
/** Extra height a cup band adds to a pill. */
export const CUP_BAND_H = 8;
/** A pill's drink row (inside its 1 px border). */
export const PILL_ROW_H = 14;
/** Every pill on a label is this wide (wider only if a name doesn't fit, and then the label shrinks). */
export const PILL_W = 72;

export interface TableDraw {
  id: string;
  number: number;
  l: number;
  t: number;
  w: number;
  h: number;
  radius: string;
  rotation: number;
  fontSize: number;
  bg: string;
  border: string;
}

export interface ServerLabel {
  tableId: string;
  l: number;
  t: number;
  w: number;
  h: number;
  ang: number;
  /** column-reverse when the label reads outward-up, so the name stays against the table. */
  dir: 'column' | 'column-reverse';
  name: string;
  /** Hot water or RO water: a small tag after the name. */
  water: 'HOT' | 'RO' | null;
  items: Pill[];
  /** Width of every pill on this label, so they line up. */
  pillW: number;
  /** Drawn at this scale (1 = full size) so the label fits its seat's space. */
  scale: number;
}

export interface ServerRoom {
  w: number;
  h: number;
  tables: TableDraw[];
  labels: ServerLabel[];
}

/** Tables drawn 25% smaller than the room scale; the drawing area inside a Letter page. */
const SG = 0.825;
const AW = 972;
const AH = 676;
const EDGE = 8;
/**
 * The space every server label gets at its seat. Wider than about 76 px and two seats on a
 * rectangle's long side (or round a corner) touch; the height is what the page can give every
 * seat at once. A label with more in it is drawn smaller to fit, so any combination of drinks,
 * cups and names fits without overlapping (see the every-combination test).
 */
export const SEAT_W = 74;
export const SEAT_H = 58;
/** The smallest a label is drawn; the test checks every real combination stays at or above it. */
export const MIN_LABEL_SCALE = 0.85;

type Spot = { x: number; y: number };

function serverShapes(t: DiningTable, p: Spot): (RotBox & { body?: boolean })[] {
  const round = t.shape === 'round';
  const a = (t.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: (RotBox & { body?: boolean })[] = [{ cx: p.x, cy: p.y, hw: ((round ? 92 : 182) * SG) / 2, hh: (92 * SG) / 2, ang: t.rotation, body: true }];
  seatGeom(t.shape).forEach((g) => {
    const h = SEAT_H;
    const sx = p.x + (g[0] * c - g[1] * s) * SG;
    const sy = p.y + (g[0] * s + g[1] * c) * SG;
    const nx = g[2] * c - g[3] * s;
    const ny = g[2] * s + g[3] * c;
    const off = -13 * SG + 3 + h / 2;
    out.push({ cx: sx + nx * off, cy: sy + ny * off, hw: SEAT_W / 2, hh: h / 2, ang: edgeAngle(nx, ny) });
  });
  return out;
}

/**
 * Where each table goes on a server sheet: centres keep their order and spread to
 * fill the page, then any two tables whose labels would touch are nudged apart a
 * few px at a time, staying on the page. The room layout itself never changes.
 */
export function serverFit(T: DiningTable[]): Map<string, Spot> {
  const bbox = (spx: number, spy: number) => {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (const t of T) {
      for (const r of serverShapes(t, { x: t.x * spx, y: t.y * spy })) {
        for (const [x, y] of corners(r)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
    }
    return { x0, y0, w: x1 - x0, h: y1 - y0 };
  };
  const maxScale = (axis: 'x' | 'y') => {
    let lo = 0.2;
    let hi = 4;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const z = axis === 'x' ? bbox(mid, 0.5).w : bbox(0.5, mid).h;
      if (z <= (axis === 'x' ? AW : AH) - 2 * EDGE) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const spx = maxScale('x');
  const spy = maxScale('y');
  const z = bbox(spx, spy);
  const ox = EDGE + (AW - 2 * EDGE - z.w) / 2 - z.x0;
  const oy = EDGE + (AH - 2 * EDGE - z.h) / 2 - z.y0;
  const pos = T.map((t) => ({ x: ox + t.x * spx, y: oy + t.y * spy }));

  for (let it = 0; it < 120; it++) {
    let moved = false;
    const S = T.map((t, i) => serverShapes(t, pos[i]!));
    for (let i = 0; i < T.length; i++) {
      for (let j = i + 1; j < T.length; j++) {
        for (const A of S[i]!) {
          for (const B of S[j]!) {
            if (A.body && B.body) continue;
            const m = separation(A, B, 4);
            if (!m) continue;
            const d = Math.min(m.o, 6) / 2; // small steps so tables move as little as needed
            pos[i]!.x += m.v[0] * d;
            pos[i]!.y += m.v[1] * d;
            pos[j]!.x -= m.v[0] * d;
            pos[j]!.y -= m.v[1] * d;
            moved = true;
          }
        }
      }
    }
    T.forEach((t, i) => {
      let x0 = 1e9;
      let y0 = 1e9;
      let x1 = -1e9;
      let y1 = -1e9;
      for (const r of serverShapes(t, pos[i]!)) {
        for (const [x, y] of corners(r)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      }
      if (x0 < EDGE) pos[i]!.x += EDGE - x0;
      if (x1 > AW - EDGE) pos[i]!.x -= x1 - (AW - EDGE);
      if (y0 < EDGE) pos[i]!.y += EDGE - y0;
      if (y1 > AH - EDGE) pos[i]!.y -= y1 - (AH - EDGE);
    });
    if (!moved) break;
  }
  return new Map(T.map((t, i) => [t.id, pos[i]!]));
}

const PLAIN = '#F9FAFB';

/**
 * Inter Bold 11 px per-character advance, with margin: measured 5.7–5.8 px for drink
 * labels and typical names in the browser (all-caps runs are wider; names that
 * don't fit are clipped by the label box).
 */
export const CHAR_W = 6.0;
/** The HOT / RO tag after a name, plus its gap. */
export const waterTagW = (w: ServerLabel['water']) => (w ? 3 + 6 + w.length * 5.6 : 0);

/** Full-size width of one drink pill: PILL_W, or more if its ½ tab and name or its cup band need it. */
export const pillW = (p: Pill) => Math.max(PILL_W, 2 + 6 + p.cap.length * CHAR_W + (p.half ? 6 + 7.5 : 0), 2 + 8 + p.cup.length * 5.2);
/** Full-size height of a label: the name line, then its pills (a cup band adds a little). */
export const labelH = (items: Pill[]) => 14 + items.length * (2 + 2 + PILL_ROW_H + CUP_BAND_H); // name line, then per pill: gap, border, row, band

/**
 * Width of what a server label actually draws (the name, the widest pill). Its box
 * is wider (84–92 px) so the two seats on a rectangle's long side, 76 px apart,
 * have boxes that overlap while their names and pills don't.
 */
export function labelInkWidth(l: Pick<ServerLabel, 'name' | 'items' | 'w'> & { water?: ServerLabel['water']; scale?: number }): number {
  const name = l.name.length * CHAR_W + waterTagW(l.water ?? null);
  return Math.min(l.w, Math.max(name, ...l.items.map(pillW)) * (l.scale ?? 1));
}

/** One pill per drink (coffee isn't shown: everyone is offered it). Hot water and RO are a tag by the name. */
export function serverPills(r: Resident, meal: string, beverages: Beverage[]): Pill[] {
  const p = prefsOf(r, meal);
  if (!p) return [];
  const items: Pill[] = [];
  const together = pouredTogether(p.drinks);
  let shown = false;
  for (const d of p.drinks) {
    const bev = beverages.find((b) => b.siteId === r.siteId && b.name === d.beverage);
    if (bev?.kind === 'coffee') continue;
    // Two halves of the same drink: one pill, "2 Cran Juice", since it's poured as one.
    if (together && d.beverage === together && d.slot === 'drink') {
      if (shown) continue;
      shown = true;
    }
    const short = bev?.shortLabel || d.beverage;
    const pair = !!together && d.beverage === together && d.slot === 'drink';
    // The cup it's actually served in (a poured-together pair goes into one glass or to-go cup).
    const served = pair ? pouredInto(p.drinks)! : d.drinkware;
    items.push({
      cap: pair ? `2 ${short}` : short,
      bg: bev?.color ?? PLAIN,
      color: bev?.textColor.toUpperCase() === '#FFFFFF' ? '#FFFFFF' : '#111827',
      // Only a glass or to-go cup comes in halves; two halves poured together make a full one.
      half: !pair && d.amount === 'Half' && hasAmount(served),
      cup: cupTag(served),
    });
  }
  return items;
}

/**
 * The space kept for every seat's label on a server sheet, where serverRoom puts the tables.
 * Each label is drawn inside its seat's space, so if these never overlap, no labels can.
 */
export function serverSeatSpaces(T: DiningTable[]): (RotBox & { tableId: string; body: boolean })[] {
  const at = serverFit(T);
  return T.flatMap((t) => serverShapes(t, at.get(t.id)!).map((b) => ({ ...b, tableId: t.id, body: !!b.body })));
}

export function serverRoom(T: DiningTable[], occupant: Occupant, meal: string, beverages: Beverage[]): ServerRoom {
  const at = serverFit(T);
  const tables: TableDraw[] = [];
  const labels: ServerLabel[] = [];
  for (const t of T) {
    const round = t.shape === 'round';
    const tw = (round ? 92 : 182) * SG;
    const th = 92 * SG;
    const { x: cx, y: cy } = at.get(t.id)!;
    const a = (t.rotation * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    seatGeom(t.shape).forEach((g, i) => {
      const r = occupant(t.id, i);
      if (!r) return;
      const sx = cx + (g[0] * c - g[1] * s) * SG;
      const sy = cy + (g[0] * s + g[1] * c) * SG;
      const nx = g[2] * c - g[3] * s;
      const ny = g[2] * s + g[3] * c;
      const ang = edgeAngle(nx, ny);
      const items = serverPills(r, meal, beverages);
      const p = prefsOf(r, meal);
      const water = p?.hotWater ? 'HOT' : p?.roWater ? 'RO' : null;
      // Drawn smaller only if the pills don't fit the seat's space (the name is cut short instead).
      const pw = Math.max(PILL_W, ...items.map(pillW));
      const k = Math.min(1, Math.floor(Math.min(SEAT_W / pw, SEAT_H / labelH(items)) * 100) / 100);
      const H = labelH(items) * k;
      const off = -13 * SG + 3 + H / 2;
      const ar = (ang * Math.PI) / 180;
      const outUp = nx * Math.sin(ar) - ny * Math.cos(ar) > 0;
      // Pyramid: longest drink next to the name, shortest farthest out.
      const len = (p: Pill) => p.cap.length + (p.half ? 2 : 0);
      items.sort((p, q) => (outUp ? 1 : -1) * (len(p) - len(q)));
      labels.push({ tableId: t.id, l: sx + nx * off - SEAT_W / 2, t: sy + ny * off - H / 2, w: SEAT_W, h: H, ang, dir: outUp ? 'column-reverse' : 'column', name: shortName(r), water, items, pillW: pw, scale: k });
    });
    tables.push({
      id: t.id,
      number: t.number,
      l: cx - tw / 2,
      t: cy - th / 2,
      w: tw,
      h: th,
      radius: round ? '50%' : `${Math.max(3, Math.round(8 * SG))}px`,
      rotation: t.rotation,
      fontSize: 15,
      bg: '#F3F4F6',
      border: '1px solid #6B7280',
    });
  }
  return { w: AW, h: AH, tables, labels };
}

/** One line in a server sheet's notes: who (by table) and their allergies, notes and ½ portion. */
export interface ServerNote {
  table: number;
  name: string;
  text: string;
}

/** The notes listed under a server sheet's drawing, by table then seat. */
export function serverNotes(T: DiningTable[], occupant: Occupant, meal: string): ServerNote[] {
  const out: ServerNote[] = [];
  for (const t of [...T].sort((a, b) => a.number - b.number)) {
    seatGeom(t.shape).forEach((_, i) => {
      const r = occupant(t.id, i);
      if (!r) return;
      const parts = [...r.notes.map((n) => n.text), ...(prefsOf(r, meal)?.portion === 'Half' ? ['½ portion'] : [])];
      if (parts.length) out.push({ table: t.number, name: shortName(r), text: parts.join(', ') });
    });
  }
  return out;
}

/** Room under a server sheet's drawing for its notes; more than this and the drawing shrinks to make room. */
export const NOTES_ROOM = 40;
export const NOTES_COLS = 3;
export const NOTES_LINE_H = 13;
const NOTES_CHARS_PER_LINE = 54; // a third of the page at 10.5 px, with margin

/** Height the notes take (heading, then lines in NOTES_COLS columns), in page pixels. */
export function notesHeight(notes: ServerNote[]): number {
  if (!notes.length) return 0;
  const lines = notes.reduce((n, x) => n + Math.ceil((`T${x.table} · ${x.name} — ${x.text}`.length) / NOTES_CHARS_PER_LINE), 0);
  return 6 + NOTES_LINE_H * (Math.ceil(lines / NOTES_COLS) + 1); // +1: the heading, and columns that don't balance exactly
}

// ---- Setup sheet ------------------------------------------------------------------------

export interface Change {
  text: string;
  bg: string;
}

/**
 * What differs from the usual setting (one glass, one coffee mug) at a seat.
 * Additions first (green), then removals (red). Title case.
 */
export function setupChanges(r: Resident, meal: string): Change[] {
  const p = prefsOf(r, meal);
  const dr = p?.drinks ?? [];
  const hasMug = dr.some((x) => x.drinkware === 'Mug') || !!p?.hotWater;
  // Two halves of the same drink are poured together: one glass instead of two juice
  // glasses, or one to-go cup instead of two.
  const into = pouredInto(dr);
  // The usual setting has one glass. It holds the first drink served in a glass (milk, a full
  // glass of juice, a juice pair poured together); any further glass, an extra glass (for
  // water) and RO water each add one.
  const glassDrinks = dr.filter((x) => x.slot === 'drink' && x.drinkware === 'Glass').length + (into === 'Glass' ? 1 : 0);
  const extraGlass = Math.max(0, glassDrinks - 1) + dr.filter((x) => x.extraGlass).length + (p?.roWater ? 1 : 0);
  const juice = dr.filter((x) => x.drinkware === 'Juice glass').length - (into === 'Glass' ? 2 : 0);
  const togo = dr.filter((x) => x.drinkware === 'To-go cup').length - (into === 'To-go cup' ? 1 : 0);
  const pitcher = dr.filter((x) => x.drinkware === 'Milk pitcher').length;
  const out: Change[] = [];
  const add = (n: number, word: string) => {
    if (n > 0) out.push({ text: `+${n > 1 ? `${n} ` : ''}${word}`, bg: '#86EFAC' });
  };
  add(extraGlass, extraGlass > 1 ? 'Glasses' : 'Glass');
  add(juice, 'Juice');
  add(togo, 'To-Go');
  add(pitcher, 'Pitcher');
  if (!hasMug) out.push({ text: 'No Mug', bg: '#FCA5A5' });
  return out;
}

export const takesCreamer = (r: Resident, meal: string) => !!prefsOf(r, meal)?.drinks.some((d) => d.creamer);

/** Seat pill look: solid grey = arm chair, black stripes = armless chair, hollow = no chair. */
export const CHAIR_PILL: Record<Chair, { bg: string; border: string }> = {
  arm: { bg: '#4B5563', border: '1px solid #4B5563' },
  no_arm: { bg: 'repeating-linear-gradient(45deg, #111827 0 1.2px, #FFFFFF 1.2px 3.5px)', border: '1px solid #111827' },
  none: { bg: '#FFFFFF', border: '1.5px solid #111827' },
};

export interface SeatPill {
  l: number;
  t: number;
  w: number;
  h: number;
  ang: number;
  chair: Chair;
}

export interface ChangeLabel {
  l: number;
  t: number;
  w: number;
  h: number;
  ang: number;
  items: Change[];
}

export interface SetupRoom {
  w: number;
  h: number;
  tables: TableDraw[];
  titles: { l: number; t: number; text: string }[];
  dividers: { l: number; h: number }[];
  pills: SeatPill[];
  changes: ChangeLabel[];
}

/** Tables (and their seats) are drawn this much larger than true scale, so seats on one table don't crowd. */
const TG = 1.35;

/**
 * Every open section side by side on one 11 × 17 floor plan. Rows line up across
 * sections; a section with fewer rows uses the first and last shared heights.
 */
export function setupRoom(sections: OpenSection[], allTables: DiningTable[], occupant: Occupant, meal: string, PW: number, PH: number): SetupRoom {
  const pad = 30;
  const secTables = sections.map((s) => allTables.filter((t) => t.section === s.section));
  const ay = new Map(allTables.map((t) => [t.id, t.y]));
  if (sections.length > 1) {
    const rowsBySec = secTables.map((ts) => rowsOf(ts)).filter((r) => r.length);
    const nMax = Math.max(...rowsBySec.map((r) => r.length));
    const mid = (row: DiningTable[]) => row.reduce((a, t) => a + t.y, 0) / row.length;
    const full = rowsBySec.filter((r) => r.length === nMax);
    const target: number[] = [];
    for (let i = 0; i < nMax; i++) target.push(full.reduce((a, r) => a + mid(r[i]!), 0) / full.length);
    for (const rows of rowsBySec) {
      rows.forEach((row, i) => {
        const to = target[rows.length === 1 ? Math.floor(nMax / 2) : Math.round((i * (nMax - 1)) / (rows.length - 1))]!;
        const d = to - mid(row);
        for (const t of row) ay.set(t.id, t.y + d);
      });
    }
  }
  const boxes = sections
    .map((s, i) => ({ s, ts: secTables[i]! }))
    .filter((b) => b.ts.length)
    .map((b) => ({
      ...b,
      x0: Math.min(...b.ts.map((t) => t.x - footprint(t)[0])) - pad,
      x1: Math.max(...b.ts.map((t) => t.x + footprint(t)[0])) + pad,
      y0: Math.min(...b.ts.map((t) => ay.get(t.id)! - footprint(t)[1])),
      y1: Math.max(...b.ts.map((t) => ay.get(t.id)! + footprint(t)[1])),
    }));
  const out: SetupRoom = { w: 0, h: 0, tables: [], titles: [], dividers: [], pills: [], changes: [] };
  if (!boxes.length) return out;
  const y0 = Math.min(...boxes.map((b) => b.y0)) - pad - 24;
  const y1 = Math.max(...boxes.map((b) => b.y1)) + pad;
  const totalW = boxes.reduce((a, b) => a + (b.x1 - b.x0), 0);
  const totalH = y1 - y0;
  const sc = Math.min(PW / totalW, PH / totalH);
  // Rows spread apart vertically to fill the page; table sizes and left-to-right spacing stay true.
  const fy = Math.max(sc, Math.min(PH / totalH, sc * 1.8));
  const labels: (ChangeLabel & { bw: number; bh: number; tix: number })[] = [];

  let ox = 0;
  boxes.forEach((b, bi) => {
    const offX = ox - b.x0 * sc;
    const offY = -y0 * fy;
    out.titles.push({ l: ox + 12, t: 8, text: b.s.label });
    if (bi > 0) out.dividers.push({ l: ox, h: totalH * fy });
    for (const t of b.ts) {
      const round = t.shape === 'round';
      const tw = (round ? 92 : 182) * sc * TG;
      const th = 92 * sc * TG;
      const cx = offX + t.x * sc;
      const cy = offY + ay.get(t.id)! * fy;
      const a = (t.rotation * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let creamer = false;
      seatGeom(t.shape).forEach((g, i) => {
        const r = occupant(t.id, i);
        if (!r) return;
        if (takesCreamer(r, meal)) creamer = true;
        const sx = cx + (g[0] * c - g[1] * s) * sc * TG;
        const sy = cy + (g[0] * s + g[1] * c) * sc * TG;
        const nx = g[2] * c - g[3] * s;
        const ny = g[2] * s + g[3] * c;
        const edge = 13 * sc * TG; // seat point → table edge
        const ex = sx - nx * edge;
        const ey = sy - ny * edge;
        // Seat pill just inside the edge, lying along it.
        const PW2 = 18;
        const PH2 = 7;
        const pin = 3 + PH2 / 2;
        out.pills.push({ l: ex - nx * pin - PW2 / 2, t: ey - ny * pin - PH2 / 2, w: PW2, h: PH2, ang: Math.round((Math.atan2(ny, nx) * 180) / Math.PI + 90), chair: r.chair });
        const items = setupChanges(r, meal);
        if (!items.length) return;
        const w = Math.max(...items.map((x) => Math.round(x.text.length * 6.3) + 14));
        const h = items.length * 16 + (items.length - 1) * 3;
        // The block runs along the table edge (never upside down), just outside it.
        const la = edgeAngle(nx, ny);
        const gx = ex + nx * (5 + h / 2);
        const gy = ey + ny * (5 + h / 2);
        const lr = (la * Math.PI) / 180;
        const bw = Math.abs(Math.cos(lr)) * w + Math.abs(Math.sin(lr)) * h;
        const bh = Math.abs(Math.sin(lr)) * w + Math.abs(Math.cos(lr)) * h;
        labels.push({ l: gx - w / 2, t: gy - h / 2, w, h, ang: la, bw, bh, items, tix: out.tables.length });
      });
      out.tables.push({
        id: t.id,
        number: t.number,
        l: cx - tw / 2,
        t: cy - th / 2,
        w: tw,
        h: th,
        radius: round ? '50%' : `${Math.max(3, Math.round(8 * sc))}px`,
        rotation: t.rotation,
        fontSize: 15,
        bg: creamer ? '#EDE9FE' : '#FFFFFF',
        border: creamer ? '1.5px solid #6D28D9' : '1.5px solid #4B5563',
      });
    }
    ox += (b.x1 - b.x0) * sc;
  });

  // Labels never overlap: when two label blocks (or a label and another table) touch,
  // slide them apart along the shorter overlap a few px at a time. Tables never move.
  const tbox = out.tables.map((t) => {
    const a = (t.rotation * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(a)) * t.w + Math.abs(Math.sin(a)) * t.h) / 2;
    const hh = (Math.abs(Math.sin(a)) * t.w + Math.abs(Math.cos(a)) * t.h) / 2;
    const cx = t.l + t.w / 2;
    const cy = t.t + t.h / 2;
    return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
  });
  const G = 4;
  type AABB = { x0: number; x1: number; y0: number; y1: number };
  const boxOf = (L: (typeof labels)[number]): AABB => {
    const cx = L.l + L.w / 2;
    const cy = L.t + L.h / 2;
    return { x0: cx - L.bw / 2, x1: cx + L.bw / 2, y0: cy - L.bh / 2, y1: cy + L.bh / 2 };
  };
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      const A = labels[i]!;
      const push = (B: AABB, both: boolean) => {
        const a = boxOf(A);
        const ox2 = Math.min(a.x1, B.x1) - Math.max(a.x0, B.x0) + G;
        const oy2 = Math.min(a.y1, B.y1) - Math.max(a.y0, B.y0) + G;
        if (ox2 <= G || oy2 <= G) return null;
        const ac = [(a.x0 + a.x1) / 2, (a.y0 + a.y1) / 2];
        const bc = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2];
        return oy2 <= ox2
          ? { dx: 0, dy: ((ac[1]! <= bc[1]! ? -1 : 1) * Math.min(oy2, 6)) / (both ? 2 : 1) }
          : { dx: ((ac[0]! <= bc[0]! ? -1 : 1) * Math.min(ox2, 6)) / (both ? 2 : 1), dy: 0 };
      };
      for (let j = i + 1; j < labels.length; j++) {
        const B = labels[j]!;
        const m = push(boxOf(B), true);
        if (m) {
          A.l += m.dx;
          A.t += m.dy;
          B.l -= m.dx;
          B.t -= m.dy;
          moved = true;
        }
      }
      tbox.forEach((B, k) => {
        if (k === A.tix) return; // labels are built outside their own table already
        const m = push(B, false);
        if (m) {
          A.l += m.dx;
          A.t += m.dy;
          moved = true;
        }
      });
    }
    if (!moved) break;
  }
  out.changes = labels.map(({ l, t, w, h, ang, items }) => ({ l, t, w, h, ang, items }));
  out.w = Math.round(ox);
  out.h = Math.round(totalH * fy);
  return out;
}

// ---- Developer stress test ---------------------------------------------------------------

/**
 * The mockup's "Stress test": a resident with two drinks (half cranberry juice,
 * chocolate milk with an extra glass, no coffee) at every seat. Used by the spacing
 * test and, in dev builds only, by `?stress` in the URL. Not offered to users.
 */
export function stressOccupant(meal: string): Occupant {
  const r: Resident = {
    id: '__stress',
    siteId: 'BE',
    first: 'Agatha',
    last: 'H',
    nickname: null,
    chair: 'arm',
    archived: false,
    notes: [{ id: 'sn', text: 'No nuts' }], // listed under the drawing
    attends: [meal as never],
    prefs: {
      [meal]: {
        roWater: false,
        hotWater: false,
        portion: 'Full',
        extras: [],
        drinks: [
          { id: 's1', slot: 'drink', beverage: 'Cranberry Juice', tea: null, drinkware: 'Juice glass', amount: 'Half', extraGlass: false, creamer: false },
          { id: 's2', slot: 'drink', beverage: 'Chocolate Milk', tea: null, drinkware: 'Glass', amount: 'Full', extraGlass: true, creamer: false },
        ],
      },
    },
  };
  return () => r;
}
