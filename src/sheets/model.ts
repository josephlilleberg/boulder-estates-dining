import type { Beverage, Chair, DiningTable, MealPrefs, Resident } from '../domain/model';
import { extraText } from '../domain/labels';
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
  /** The dark band under the drink: what the server fills (GLASS, TO-GO…), or for tea which tea (CHAMOMILE, GREEN…). */
  cup: string | null;
  /** Supper's combined sheet: this cup is added to the usual setting (a green + square on the band). */
  plus?: boolean;
}

/** Short names for the cup band on server sheets. */
const CUP_TAG: Record<string, string> = { 'To-go cup': 'To-go', 'Milk pitcher': 'Pitcher', 'Juice glass': 'Juice glass', Glass: 'Glass', Mug: 'Mug' };
export const cupTag = (drinkware: string) => CUP_TAG[drinkware] ?? drinkware;
/** Extra height a cup band adds to a pill. */
export const CUP_BAND_H = 11; // 7.5 px text with room above and below
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
  items: Pill[];
  /** Supper's combined sheet: the resident's extras as chips, furthest from the table. */
  chips: Change[];
  /** Width of every pill on this label, so they line up. */
  pillW: number;
  /** Drawn at this scale: the sheet's scale, a little less if a pill is wider than a seat. */
  scale: number;
}

export interface ServerRoom {
  w: number;
  h: number;
  /** Every label on the sheet is drawn at this scale: 1, or less when a full section needs the room. */
  scale: number;
  /** Chair pills on the table edges and "Mug" markers on the tables (Supper's combined sheet only). */
  pills: SeatPill[];
  mugs: MugMark[];
  tables: TableDraw[];
  labels: ServerLabel[];
}

/** Tables drawn 25% smaller than the room scale; the drawing area inside a Letter page. */
const SG = 0.825;
/** The drawing area inside a page: a Letter server sheet, or an 11 × 17 page (Supper's combined sheet). */
export type Area = { w: number; h: number };
const LETTER_AREA: Area = { w: 972, h: 676 };
export const areaFor = (pageW: number, pageH: number, below = 0): Area => ({ w: pageW - 84, h: pageH - 140 - below });
const EDGE = 8;
/**
 * Widest a server label is drawn: the two seats on a rectangle's long side are 76 px apart,
 * so anything wider would touch its neighbour at the same table.
 */
export const SEAT_W = 74;
/** Clear space kept between the labels (and tables) of different tables on a server sheet. */
export const SERVER_GAP = 20;
/** A full section's labels shrink together to fit, never below this. */
export const MIN_SHEET_SCALE = 0.5;
/** Space between the name and the first pill, and between pills. */
export const NAME_GAP = 5;
export const PILL_GAP = 2;

type Spot = { x: number; y: number };
/** Each seat's label height at full size (0: nobody there). */
type SeatHeight = (seat: number) => number;

/** A table and the space its labels take, at label scale k. */
function serverShapes(t: DiningTable, p: Spot, lh: SeatHeight, k: number): (RotBox & { body?: boolean })[] {
  const round = t.shape === 'round';
  const a = (t.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: (RotBox & { body?: boolean })[] = [{ cx: p.x, cy: p.y, hw: ((round ? 92 : 182) * SG) / 2, hh: (92 * SG) / 2, ang: t.rotation, body: true }];
  seatGeom(t.shape).forEach((g, i) => {
    const h = lh(i) * k;
    if (!h) return;
    const sx = p.x + (g[0] * c - g[1] * s) * SG;
    const sy = p.y + (g[0] * s + g[1] * c) * SG;
    const nx = g[2] * c - g[3] * s;
    const ny = g[2] * s + g[3] * c;
    const off = -13 * SG + 3 + h / 2;
    out.push({ cx: sx + nx * off, cy: sy + ny * off, hw: (SEAT_W * k) / 2, hh: h / 2, ang: edgeAngle(nx, ny) });
  });
  return out;
}

/**
 * Where each table goes on a server sheet: centres keep their order and spread to
 * fill the page, then any two tables whose labels would touch are nudged apart a
 * few px at a time, staying on the page. The room layout itself never changes.
 */
export function serverFit(T: DiningTable[], lhOf: Map<string, SeatHeight>, k: number, area: Area = LETTER_AREA): Map<string, Spot> {
  const { w: AW, h: AH } = area;
  const lh = (t: DiningTable): SeatHeight => lhOf.get(t.id) ?? (() => 0);
  const bbox = (spx: number, spy: number) => {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (const t of T) {
      for (const r of serverShapes(t, { x: t.x * spx, y: t.y * spy }, lh(t), k)) {
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
    const S = T.map((t, i) => serverShapes(t, pos[i]!, lh(t), k));
    for (let i = 0; i < T.length; i++) {
      for (let j = i + 1; j < T.length; j++) {
        for (const A of S[i]!) {
          for (const B of S[j]!) {
            if (A.body && B.body) continue;
            const m = separation(A, B, SERVER_GAP);
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
      for (const r of serverShapes(t, pos[i]!, lh(t), k)) {
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

/** Whether any two tables' labels (or a label and another table) come closer than the gap allows. */
function crowded(T: DiningTable[], at: Map<string, Spot>, lhOf: Map<string, SeatHeight>, k: number): boolean {
  const S = T.map((t) => serverShapes(t, at.get(t.id)!, lhOf.get(t.id) ?? (() => 0), k));
  for (let i = 0; i < S.length; i++)
    for (let j = i + 1; j < S.length; j++)
      for (const A of S[i]!) for (const B of S[j]!) if (!(A.body && B.body) && separation(A, B, SERVER_GAP - 2)) return true;
  return false;
}

const PLAIN = '#F9FAFB';

/**
 * Inter Bold 11 px per-character advance, with margin: measured 5.7–5.8 px for drink
 * labels and typical names in the browser (all-caps runs are wider; names that
 * don't fit are clipped by the label box).
 */
export const CHAR_W = 6.0;
/** Full-size width of one drink pill: PILL_W, or more if its ½ tab and name or its cup band need it. */
export const pillW = (p: Pill) => Math.max(PILL_W, 2 + 6 + p.cap.length * CHAR_W + (p.half ? 6 + 7.5 : 0), p.cup ? 2 + 8 + p.cup.length * 5.2 + (p.plus ? CUP_BAND_H + 1 - 4 : 0) : 0);
/** Full-size height of a label: the name line, then its pills (a cup band adds a little). */
export const labelH = (items: Pill[]) =>
  14 + (items.length ? NAME_GAP + (items.length - 1) * PILL_GAP : 0) + items.reduce((h, p) => h + 2 + PILL_ROW_H + (p.cup ? CUP_BAND_H : 0), 0);

/**
 * Width of what a server label actually draws (the name, the widest pill). Its box
 * is wider (84–92 px) so the two seats on a rectangle's long side, 76 px apart,
 * have boxes that overlap while their names and pills don't.
 */
export function labelInkWidth(l: Pick<ServerLabel, 'name' | 'items' | 'w'> & { scale?: number }): number {
  const name = l.name.length * CHAR_W;
  return Math.min(l.w, Math.max(name, ...l.items.map(pillW)) * (l.scale ?? 1));
}

/** Setup chips as drawn: 16 px tall, 3 px apart, 10 px bold text. */
/** A setup chip: wide enough for its words, but short. */
export const CHIP_H = 12;
/** Clear space between the chair pill (on the table edge) and the first chip. */
export const CHAIR_GAP = 6;
const CHIP_GAP = 3;
/** The extras box: one line per extra, 12 px each, inside 2 px padding and a 1 px border. */
export const BOX_LINE_H = 12;
/** Height of one chip, or of the extras box. */
export const itemH = (c: Change) => (c.lines ? 2 + 4 + c.lines.length * BOX_LINE_H : CHIP_H);
/** Width of one chip, or of the extras box (its longest line). */
export const chipW = (c: Change) => Math.round(Math.max(...(c.lines ?? [c.text]).map((t) => t.length)) * 6.3) + 14;
export const chipsH = (cs: Change[]) => (cs.length ? stackH(cs) + NAME_GAP : 0);
/** Chips stacked on their own (a setup-only label). */
export const stackH = (cs: Change[]) => (cs.length ? cs.reduce((h, c) => h + itemH(c), 0) + (cs.length - 1) * CHIP_GAP : 0);

/** A label with two drinks, both with cup bands: the least room any seat keeps. */
const TWO_DRINKS_H = 14 + NAME_GAP + PILL_GAP + 2 * (2 + PILL_ROW_H + CUP_BAND_H);

/** Pill order on every label, first next to the name: milk, juice, tea, anything else, then water. */
const PILL_RANK: Record<string, number> = { milk: 0, juice: 1, tea: 2, other: 3, water: 4, ro: 5, hot: 6 };

/**
 * One pill per drink, then RO water (a glass) and hot water (a pitcher): everything the server
 * fills. Coffee isn't shown (everyone is offered it); tea has no cup band (a mug isn't filled).
 */
export function serverPills(r: Resident, meal: string, beverages: Beverage[], opts: { adds?: boolean } = {}): Pill[] {
  const p = prefsOf(r, meal);
  if (!p) return [];
  // [order, pill, cup it's served in] — the cup decides the + square on Supper's sheet.
  const ranked: [number, Pill, string][] = [];
  const items = { push: (rank: number, x: Pill, served = '') => ranked.push([rank, x, served]) };
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
    items.push(PILL_RANK[bev?.kind ?? 'other'] ?? PILL_RANK.other!, {
      cap: pair ? `2 ${short}` : short,
      bg: bev?.color ?? PLAIN,
      color: bev?.textColor.toUpperCase() === '#FFFFFF' ? '#FFFFFF' : '#111827',
      // Only a glass or to-go cup comes in halves; two halves poured together make a full one.
      half: !pair && d.amount === 'Half' && hasAmount(served),
      // Tea's mug isn't filled by the server, so its band says which tea instead ("Green Tea" → GREEN).
      cup: bev?.kind === 'tea' ? (d.tea ? d.tea.replace(/ Tea$/, '') : null) : served === 'Mug' ? null : cupTag(served),
    }, served);
  }
  // On Supper's sheet an extra glass (for water) is a pill too, so the server fills it and setup adds it.
  if (opts.adds) for (const d of p.drinks) if (d.extraGlass) items.push(PILL_RANK.water!, { cap: 'Water', bg: PLAIN, color: '#111827', half: false, cup: 'Glass' }, 'Glass');
  if (p.roWater) items.push(PILL_RANK.ro!, { cap: 'RO water', bg: PLAIN, color: '#111827', half: false, cup: 'Glass' }, 'Glass');
  if (p.hotWater) items.push(PILL_RANK.hot!, { cap: 'Hot water', bg: PLAIN, color: '#111827', half: false, cup: 'Pitcher' }, 'added');
  // The same order at every seat (stable within a kind: drink 1 before drink 2).
  const sorted = ranked.sort((a, b) => a[0] - b[0]);
  if (!opts.adds) return sorted.map(([, x]) => x);
  // Which cups are added to the usual setting (a glass and a mug), as the setup sheet counts them:
  // the first thing served in a glass (a drink first, else RO water or the water glass) uses the
  // usual glass; every other glass, juice glass, to-go cup and pitcher is added. Mugs never are.
  let usualGlass = false;
  return sorted.map(([, x, served]) => {
    if (served === 'Glass' && !usualGlass) {
      usualGlass = true;
      return x;
    }
    return served && served !== 'Mug' ? { ...x, plus: true } : x;
  });
}

/**
 * A server sheet: tables keep their order and spread out so every label has a clear gap to the
 * next table's, sized by what's actually at each seat. If a section is too full for that at full
 * size, every label on the sheet shrinks by the same amount (never below MIN_SHEET_SCALE).
 */
/**
 * What a sheet draws at each seat: 'server' names and drinks; 'setup' the setup chips (with chair
 * pills, the no-mug dot and creamer tint); 'both' all of it (Supper). With shared, a seat keeps
 * room for the bigger of its setup and server labels, so a meal's setup and server sheets put every
 * table in the same place (Breakfast).
 */
export type SeatDraw = 'server' | 'setup' | 'both';

export function serverRoom(T: DiningTable[], occupant: Occupant, meal: string, beverages: Beverage[], opts: { draw?: SeatDraw; shared?: boolean; area?: Area } = {}): ServerRoom {
  const area = opts.area ?? LETTER_AREA;
  const draw = opts.draw ?? 'server';
  const pillsAt = new Map<string, Pill[]>();
  const chipsAt = new Map<string, Change[]>();
  const roomAt = new Map<string, number>();
  for (const t of T) seatGeom(t.shape).forEach((_, i) => {
    const r = occupant(t.id, i);
    if (!r) return;
    const key = `${t.id}:${i}`;
    // Supper's sheet: + squares on added cups instead of +Glass chips, so only the extras are chips.
    const pills = serverPills(r, meal, beverages, { adds: draw === 'both' });
    const setup = setupChanges(r, meal);
    pillsAt.set(key, draw === 'setup' ? [] : pills);
    chipsAt.set(key, draw === 'both' ? extraChips(r, meal) : draw === 'setup' ? setup : []);
    const serverH = labelH(pills);
    roomAt.set(key, draw === 'both' ? serverH + chipsH(extraChips(r, meal)) : opts.shared || draw === 'setup' ? Math.max(serverH, stackH(setup)) : serverH);
  });
  // Every seat, empty or not, keeps room for at least two drinks, so the tables sit in the same
  // place whoever is seated; only a seat with more than that needs extra.
  // With chair pills drawn, labels start past the pill and a clear gap.
  const lead = draw === 'server' ? 0 : 0.5 + CHAIR_GAP;
  const lhOf = new Map(T.map((t) => [t.id, (i: number) => lead + Math.max(TWO_DRINKS_H, roomAt.get(`${t.id}:${i}`) ?? 0)]));
  let sheetK = 1;
  let at = serverFit(T, lhOf, 1, area);
  if (crowded(T, at, lhOf, 1)) {
    let lo = MIN_SHEET_SCALE;
    let hi = 1;
    let best = { k: MIN_SHEET_SCALE, at: serverFit(T, lhOf, MIN_SHEET_SCALE, area) };
    for (let n = 0; n < 7; n++) {
      const mid = (lo + hi) / 2;
      const m = serverFit(T, lhOf, mid, area);
      if (crowded(T, m, lhOf, mid)) hi = mid;
      else [lo, best] = [mid, { k: mid, at: m }];
    }
    [sheetK, at] = [Math.floor(best.k * 100) / 100, best.at];
  }
  const tables: TableDraw[] = [];
  const labels: ServerLabel[] = [];
  const pills: SeatPill[] = [];
  const mugs: MugMark[] = [];
  for (const t of T) {
    let creamer = false;
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
      const items = pillsAt.get(`${t.id}:${i}`) ?? [];
      const chips = chipsAt.get(`${t.id}:${i}`) ?? [];
      if (draw !== 'server') {
        if (takesCreamer(r, meal)) creamer = true;
        // Chair pill on the table edge; a red dot on the table when the mug comes off.
        const m = edgeMarks(sx - nx * 13 * SG, sy - ny * 13 * SG, nx, ny, r.chair, noMug(r, meal), true);
        pills.push(m.pill);
        if (m.mug) mugs.push(m.mug);
      }
      // The sheet's scale; a little less if a pill or chip is wider than a seat (the name is cut short instead).
      const pw = Math.max(PILL_W, ...items.map(pillW));
      const k = Math.floor(sheetK * Math.min(1, SEAT_W / Math.max(pw, ...chips.map(chipW))) * 100) / 100;
      const H = (draw === 'setup' ? stackH(chips) : labelH(items) + chipsH(chips)) * k;
      const off = -13 * SG + 3 + lead + H / 2;
      const ar = (ang * Math.PI) / 180;
      const outUp = nx * Math.sin(ar) - ny * Math.cos(ar) > 0;
      labels.push({ tableId: t.id, l: sx + nx * off - (SEAT_W * sheetK) / 2, t: sy + ny * off - H / 2, w: SEAT_W * sheetK, h: H, ang, dir: outUp ? 'column-reverse' : 'column', name: draw === 'setup' ? '' : shortName(r), items, chips, pillW: pw, scale: k });
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
      // With setup drawn, a table where anyone takes creamer is tinted, as on the setup sheet.
      bg: creamer ? '#EDE9FE' : '#F3F4F6',
      border: creamer ? '1.5px solid #6D28D9' : '1px solid #6B7280',
    });
  }
  return { w: area.w, h: area.h, scale: sheetK, tables, labels, pills, mugs };
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
  /** Text colour; dark unless set (−Mug is white on solid red). */
  color?: string;
  /** The extras box: one line per extra (text is them joined, for reading aloud and tests). */
  lines?: string[];
}

/** A resident's extras for a meal as one box, an extra per line, as written ("Banana", "Napkins ×2"). */
export const extraChips = (r: Resident, meal: string): Change[] => {
  const lines = (prefsOf(r, meal)?.extras ?? []).map(extraText);
  return lines.length ? [{ text: lines.join(', '), lines, bg: EXTRA_BG }] : [];
};

/** "Mug" on the table at a seat that has no coffee or tea: take the mug away. Solid red with white text, so it stands out (and prints dark). */
export const NO_MUG = { bg: '#DC2626', color: '#FFFFFF' };

/** No coffee or tea at this meal, so the usual mug comes off the table (hot water comes in a pitcher). */
export const noMug = (r: Resident, meal: string): boolean => !(prefsOf(r, meal)?.drinks ?? []).some((x) => x.drinkware === 'Mug');

/** A "Mug" marker on a table, just inside the edge at the seat, reading along the edge. */
export interface MugMark {
  l: number;
  t: number;
  w: number;
  h: number;
  ang: number;
  /** Supper's sheet: a small red dot instead of the word. */
  dot?: boolean;
}
export const MUG_DOT = 7;
export const MUG_W = 26;
export const MUG_H = 12;

/**
 * Where a seat's chair pill and "Mug" marker go: the pill centred on the table edge, lying along it,
 * and the marker on the table just inside it. (ex, ey) is the edge point, (nx, ny) the outward normal.
 */
function edgeMarks(ex: number, ey: number, nx: number, ny: number, chair: Chair, mug: boolean, dot = false): { pill: SeatPill; mug: MugMark | null } {
  const pill = { l: ex - 9, t: ey - 3.5, w: 18, h: 7, ang: Math.round((Math.atan2(ny, nx) * 180) / Math.PI + 90), chair };
  const [w, h] = dot ? [MUG_DOT, MUG_DOT] : [MUG_W, MUG_H];
  const inset = 3.5 + 2 + h / 2;
  return { pill, mug: mug ? { l: ex - nx * inset - w / 2, t: ey - ny * inset - h / 2, w, h, ang: edgeAngle(nx, ny), dot } : null };
}

/** Chips in rows, side by side while they fit in maxW (4 px apart), in order. */
export function chipRows(items: Change[], maxW: number): Change[][] {
  const rows: Change[][] = [];
  let w = Infinity;
  for (const c of items) {
    const cw = chipW(c);
    const last = rows[rows.length - 1];
    if (last && !c.lines && !last.some((x) => x.lines) && w + 4 + cw <= maxW) {
      last.push(c);
      w += 4 + cw;
    } else {
      rows.push([c]);
      w = cw;
    }
  }
  return rows;
}
const rowW = (row: Change[]) => row.reduce((a, c) => a + chipW(c), 0) + (row.length - 1) * 4;
const rowH = (row: Change[]) => Math.max(...row.map(itemH));

/** Setup-sheet chip colour for a resident's extras (fruit, napkins, jelly…). */
export const EXTRA_BG = '#FEF3C7';

/**
 * What's added to the usual setting (one glass, one coffee mug) at a seat (green), then the
 * resident's extras (yellow). Taking the mug away is shown on the table instead (see noMug).
 */
export function setupChanges(r: Resident, meal: string): Change[] {
  const p = prefsOf(r, meal);
  const dr = p?.drinks ?? [];
  // Hot water comes in a pitcher, not a mug.
  // Two halves of the same drink are poured together: one glass instead of two juice
  // glasses, or one to-go cup instead of two.
  const into = pouredInto(dr);
  // The usual setting has one glass. It holds the first drink served in a glass (milk, a full
  // glass of juice, a juice pair poured together), or else RO water / the water glass; every
  // further glass (drinks, an extra glass for water, RO water) adds one.
  const glassDrinks = dr.filter((x) => x.slot === 'drink' && x.drinkware === 'Glass').length + (into === 'Glass' ? 1 : 0);
  const extraGlass = Math.max(0, glassDrinks + dr.filter((x) => x.extraGlass).length + (p?.roWater ? 1 : 0) - 1);
  const juice = dr.filter((x) => x.drinkware === 'Juice glass').length - (into === 'Glass' ? 2 : 0);
  const togo = dr.filter((x) => x.drinkware === 'To-go cup').length - (into === 'To-go cup' ? 1 : 0);
  const pitcher = dr.filter((x) => x.drinkware === 'Milk pitcher').length + (p?.hotWater ? 1 : 0);
  const out: Change[] = [];
  const add = (n: number, word: string) => {
    if (n > 0) out.push({ text: `+${n > 1 ? `${n} ` : ''}${word}`, bg: '#86EFAC' });
  };
  add(extraGlass, extraGlass > 1 ? 'Glasses' : 'Glass');
  add(juice, 'Juice');
  add(togo, 'To-Go');
  add(pitcher, pitcher > 1 ? 'Pitchers' : 'Pitcher');
  // Extras for this meal, as written ("Banana", "Napkins ×2"), in their own colour after the drinkware.
  out.push(...extraChips(r, meal));
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
  /** The table whose seat this is. */
  tableId: string;
  /** The chips in rows, side by side where the seat has room. */
  rows: Change[][];
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
  /** "Mug" markers on the tables, at seats with no coffee or tea. */
  mugs: MugMark[];
  changes: ChangeLabel[];
  /** Drawn at this scale: 1, or less when the sections' chips need more width than the page has. */
  scale: number;
}

/** Tables (and their seats) are drawn this much larger than true scale, so seats on one table don't crowd. */
const TG = 1.35;

/** Clear space kept between one table's chips and the next table (and its chips) on the setup sheet. */
export const SETUP_GAP = 12;

type AABB = { x0: number; x1: number; y0: number; y1: number };
const tableAABB = (t: TableDraw): AABB => {
  const a = (t.rotation * Math.PI) / 180;
  const hw = (Math.abs(Math.cos(a)) * t.w + Math.abs(Math.sin(a)) * t.h) / 2;
  const hh = (Math.abs(Math.sin(a)) * t.w + Math.abs(Math.cos(a)) * t.h) / 2;
  const cx = t.l + t.w / 2;
  const cy = t.t + t.h / 2;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
};
const labelAABB = (L: { l: number; t: number; w: number; h: number; bw: number; bh: number }): AABB => {
  const cx = L.l + L.w / 2;
  const cy = L.t + L.h / 2;
  return { x0: cx - L.bw / 2, x1: cx + L.bw / 2, y0: cy - L.bh / 2, y1: cy + L.bh / 2 };
};

/**
 * Setup sheet: each table moves together with its seat pills and change labels. Neighbours in a
 * row whose chips come within SETUP_GAP slide apart sideways (rows and order stay as in the room).
 * Then each section takes the width its tables and chips need, side by side; spare width is shared
 * out. Returns the room's width, which is more than PW only when the sheet must be drawn smaller.
 */
function spreadSetupTables(out: SetupRoom, labels: { l: number; t: number; w: number; h: number; bw: number; bh: number; tix: number }[], pillTix: number[], mugTix: number[], secOf: number[], titles: string[], PW: number, H: number): number {
  const n = out.tables.length;
  const move = (i: number, dx: number) => {
    out.tables[i]!.l += dx;
    for (const L of labels) if (L.tix === i) L.l += dx;
    out.pills.forEach((p, k) => {
      if (pillTix[k] === i) p.l += dx;
    });
    out.mugs.forEach((p, k) => {
      if (mugTix[k] === i) p.l += dx;
    });
  };
  const parts = (i: number): AABB[] => [tableAABB(out.tables[i]!), ...labels.filter((L) => L.tix === i).map(labelAABB)];
  const cx = (i: number) => out.tables[i]!.l + out.tables[i]!.w / 2;
  for (let it = 0; it < 200; it++) {
    let moved = false;
    const P = Array.from({ length: n }, (_, i) => parts(i));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (secOf[i] !== secOf[j]) continue;
        for (const a of P[i]!) {
          for (const b of P[j]!) {
            const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + SETUP_GAP;
            const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + SETUP_GAP;
            if (ox <= 0 || oy <= 0) continue;
            const d = (Math.min(ox, 6) / 2) * (cx(i) <= cx(j) ? -1 : 1);
            move(i, d);
            move(j, -d);
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
  }
  // Sections side by side, each as wide as its tables and chips need.
  const PADX = 16;
  const secs = titles.map((_, k) => {
    const ps = out.tables.flatMap((_, i) => (secOf[i] === k ? parts(i) : []));
    return ps.length ? { x0: Math.min(...ps.map((p) => p.x0)), x1: Math.max(...ps.map((p) => p.x1)) } : { x0: 0, x1: 0 };
  });
  const need = secs.reduce((a, e) => a + e.x1 - e.x0 + 2 * PADX, 0);
  const extra = Math.max(0, PW - need) / titles.length;
  out.titles = [];
  out.dividers = [];
  let cur = 0;
  secs.forEach((e, k) => {
    const dx = cur + PADX + extra / 2 - e.x0;
    for (let i = 0; i < n; i++) if (secOf[i] === k) move(i, dx);
    out.titles.push({ l: cur + 12, t: 8, text: titles[k]! });
    if (k > 0) out.dividers.push({ l: cur, h: H });
    cur += e.x1 - e.x0 + 2 * PADX + extra;
  });
  return cur;
}

/**
 * Every open section side by side on one 11 × 17 floor plan. Rows line up across
 * sections; a section with fewer rows uses the first and last shared heights.
 */
export function setupRoom(sections: OpenSection[], allTables: DiningTable[], occupant: Occupant, meal: string, PW: number, PH: number): SetupRoom {
  // A sheet drawn smaller to fit its width would leave the page's height unused, so lay it out
  // again with the height it will have once scaled (rows spread further apart).
  const first = buildSetupRoom(sections, allTables, occupant, meal, PW, PH);
  return first.scale < 1 ? buildSetupRoom(sections, allTables, occupant, meal, PW, PH / first.scale) : first;
}

function buildSetupRoom(sections: OpenSection[], allTables: DiningTable[], occupant: Occupant, meal: string, PW: number, PH: number): SetupRoom {
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
  const out: SetupRoom = { w: 0, h: 0, tables: [], titles: [], dividers: [], pills: [], mugs: [], changes: [], scale: 1 };
  if (!boxes.length) return out;
  const y0 = Math.min(...boxes.map((b) => b.y0)) - pad - 24;
  const y1 = Math.max(...boxes.map((b) => b.y1)) + pad;
  const totalW = boxes.reduce((a, b) => a + (b.x1 - b.x0), 0);
  const totalH = y1 - y0;
  const sc = Math.min(PW / totalW, PH / totalH);
  // Rows spread apart vertically to fill the page; table sizes and left-to-right spacing stay true.
  const fy = Math.max(sc, Math.min(PH / totalH, sc * 1.8));
  const labels: (Omit<ChangeLabel, 'tableId'> & { bw: number; bh: number; tix: number })[] = [];
  const pillTix: number[] = []; // which table each seat pill belongs to
  const mugTix: number[] = []; // and each "Mug" marker
  const secOf: number[] = []; // each table's section (index into boxes)

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
        // Chair pill centred on the table edge; "Mug" on the table inside it when there's no coffee or tea.
        const m = edgeMarks(ex, ey, nx, ny, r.chair, noMug(r, meal));
        out.pills.push(m.pill);
        pillTix.push(out.tables.length);
        if (m.mug) {
          out.mugs.push(m.mug);
          mugTix.push(out.tables.length);
        }
        const items = setupChanges(r, meal);
        if (!items.length) return;
        // Side by side where the seat has room without reaching the next seat's chips: one seat's width
        // along a rectangle's long side; at an end or a round table, up to the neighbouring seats' edge.
        const longSide = t.shape !== 'round' && g[3] !== 0;
        const rows = chipRows(items, longSide ? 92 * sc * TG - 6 : 2 * (46 * sc * TG + 7) - 6);
        const w = Math.max(...rows.map(rowW));
        const h = rows.reduce((a, row) => a + rowH(row), 0) + (rows.length - 1) * 3;
        // The block runs along the table edge (never upside down), just outside it.
        const la = edgeAngle(nx, ny);
        // Past the chair pill (half of it sticks out of the edge), then a clear gap.
        const gx = ex + nx * (3.5 + CHAIR_GAP + h / 2);
        const gy = ey + ny * (3.5 + CHAIR_GAP + h / 2);
        const lr = (la * Math.PI) / 180;
        const bw = Math.abs(Math.cos(lr)) * w + Math.abs(Math.sin(lr)) * h;
        const bh = Math.abs(Math.sin(lr)) * w + Math.abs(Math.cos(lr)) * h;
        labels.push({ l: gx - w / 2, t: gy - h / 2, w, h, ang: la, bw, bh, items, rows, tix: out.tables.length });
      });
      secOf.push(bi);
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


  // First each table's chips settle: when two label blocks (or a label and another table) touch,
  // slide them apart along the shorter overlap a few px at a time.
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
  // Then tables (each with its settled chips) slide apart so neighbours keep a clear gap.
  const roomW = spreadSetupTables(out, labels, pillTix, mugTix, secOf, boxes.map((b) => b.s.label), PW, totalH * fy);
  out.changes = labels.map(({ l, t, w, h, ang, items, rows, tix }) => ({ tableId: out.tables[tix]!.id, l, t, w, h, ang, items, rows }));
  out.w = Math.round(roomW);
  out.scale = Math.min(1, Math.floor((PW / roomW) * 100) / 100);
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
