import { extraText } from '../../domain/labels';
import type { Beverage, DiningTable, MealPrefs, Resident, SeatAssignment } from '../../domain/model';
import { CHAIR_LABEL, fullName, pouredTogether, shortName } from '../../domain/model';
import { footprint, seatPoints } from '../../domain/room';
import { seatGeom } from '../../domain/tables';

// Seating screen geometry and lists, ported from the mockup's seatingVals /
// room(mode: 'seat') / seatPopup. Pure functions so the rules can be tested
// without a browser. Pixel values match the mockup.

/** "tableId|seat" identifies a seat within one meal. */
export type SeatKey = string;
export const seatKey = (tableId: string, seat: number): SeatKey => `${tableId}|${seat}`;
export function parseSeatKey(k: SeatKey): { tableId: string; seat: number } {
  const i = k.lastIndexOf('|');
  return { tableId: k.slice(0, i), seat: Number(k.slice(i + 1)) };
}

export interface Crop {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** The section's tables (with seats and labels) plus 34 units of margin. */
export function cropOf(tables: DiningTable[]): Crop | null {
  if (!tables.length) return null;
  const P = 34;
  const x0 = Math.min(...tables.map((t) => t.x - footprint(t)[0])) - P;
  const x1 = Math.max(...tables.map((t) => t.x + footprint(t)[0])) + P;
  const y0 = Math.min(...tables.map((t) => t.y - footprint(t)[1])) - P;
  const y1 = Math.max(...tables.map((t) => t.y + footprint(t)[1])) + P;
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

/** Fits the section's tables into the space below the tabs (w × h, from useFitBox), so the map never scrolls. */
export function seatingScale(crop: Crop | null, w: number, h: number): number {
  if (!crop) return 0.74;
  const availW = (w || 790) - 8;
  const availH = (h || 640) - 4;
  return Math.max(0.45, Math.min(1.3, availW / crop.w, availH / crop.h));
}

export interface TableBox {
  id: string;
  number: number;
  round: boolean;
  l: number;
  t: number;
  w: number;
  h: number;
  rotation: number;
  radius: string;
  fontSize: number;
}

export interface SeatLabel {
  key: SeatKey;
  tableNumber: number;
  resident: Resident | null;
  name: string;
  l: number;
  t: number;
  w: number;
  h: number;
  angle: number;
  /** Outward normal (rotated), used to place the picker on the far side of the seat. */
  nx: number;
  ny: number;
  fontSize: number;
}

export interface SeatRoom {
  w: number;
  h: number;
  tables: TableBox[];
  labels: SeatLabel[];
}

/**
 * Tables and one label per seat: a name for a seated resident, or a small "+"
 * circle (16 px; 20 px while placing someone) for an empty seat.
 */
export function seatRoom(tables: DiningTable[], sc: number, crop: Crop | null, occupant: (k: SeatKey) => Resident | null, picking: boolean): SeatRoom {
  const ox = crop?.x0 ?? 0;
  const oy = crop?.y0 ?? 0;
  const hh = 10;
  // Name boxes are as wide as the gap between neighbouring seats allows (seats on a long side are 92 units apart).
  const hw = Math.max(31, Math.min(52, (92 * sc) / 2 - 3));
  const hwFree = 46;
  const out: SeatRoom = { w: (crop?.w ?? 1040) * sc, h: (crop?.h ?? 800) * sc, tables: [], labels: [] };

  for (const t of tables) {
    const round = t.shape === 'round';
    const tw = (round ? 92 : 182) * sc;
    const th = 92 * sc;
    out.tables.push({
      id: t.id,
      number: t.number,
      round,
      l: (t.x - ox) * sc - tw / 2,
      t: (t.y - oy) * sc - th / 2,
      w: tw,
      h: th,
      rotation: t.rotation,
      radius: round ? '50%' : `${Math.max(3, Math.round(8 * sc))}px`,
      fontSize: Math.round(22 * sc),
    });

    const geom = seatGeom(t.shape);
    seatPoints(t).forEach((p, i) => {
      const key = seatKey(t.id, i);
      const r = occupant(key);
      const sx = (p.x - ox) * sc;
      const sy = (p.y - oy) * sc;
      // Text faces the table; seats that would read upside down flip.
      let ang = Math.round((Math.atan2(p.ny, p.nx) * 180) / Math.PI + 90);
      ang = ((((ang + 180) % 360) + 360) % 360) - 180;
      if (ang > 90 || ang < -90) ang = ang > 0 ? ang - 180 : ang + 180;
      const off = hh - 6; // the name sits right against the table edge
      const lx = sx + p.nx * off;
      const ly = sy + p.ny * off;
      // Only the two seats sharing a rectangle's long side are squeezed by a neighbour.
      const hwX = !round && geom[i]![3] !== 0 ? hw : hwFree;
      const base = { key, tableNumber: t.number, nx: p.nx, ny: p.ny };
      if (r) {
        const name = shortName(r);
        out.labels.push({
          ...base,
          resident: r,
          name,
          l: lx - hwX,
          t: ly - hh,
          w: hwX * 2,
          h: hh * 2,
          angle: ang,
          // 12 px; only a name that wouldn't fit gets a little smaller (never below 9.5).
          fontSize: Math.max(9.5, Math.min(12, (hwX * 2 - 6) / (name.length * 0.62))),
        });
      } else {
        const D = picking ? 20 : 16;
        out.labels.push({ ...base, resident: null, name: '', l: lx - D / 2, t: ly - D / 2, w: D, h: D, angle: 0, fontSize: 11 });
      }
    });
  }
  return out;
}

// ---- Who's coming, who's seated -------------------------------------------------

const byLastName = (a: Resident, b: Resident) => (a.last + a.first).localeCompare(b.last + b.first);

export interface MealRoster {
  /** Comes to this meal and not archived. */
  coming: Resident[];
  /** residentId → seat. */
  seatOf: Map<string, SeatAssignment>;
  /** seat → resident. */
  bySeat: Map<SeatKey, Resident>;
  waiting: Resident[];
}

export function mealRoster(residents: Resident[], seating: SeatAssignment[], siteId: string, meal: string): MealRoster {
  const coming = residents.filter((r) => r.siteId === siteId && !r.archived && r.attends.includes(meal as never));
  const byId = new Map(coming.map((r) => [r.id, r]));
  const seatOf = new Map<string, SeatAssignment>();
  const bySeat = new Map<SeatKey, Resident>();
  for (const s of seating) {
    const r = s.siteId === siteId && s.meal === meal ? byId.get(s.residentId) : undefined;
    if (!r) continue;
    seatOf.set(r.id, s);
    bySeat.set(seatKey(s.tableId, s.seat), r);
  }
  return { coming, seatOf, bySeat, waiting: coming.filter((r) => !seatOf.has(r.id)) };
}

export interface PickerList {
  waiting: Resident[];
  /** Seated elsewhere at this meal; only listed while searching. */
  others: Resident[];
  /** Total waiting before the 5-name cap (for "N more waiting"). */
  waitingTotal: number;
}

/** "Who sits here?" lists: up to 5 waiting (8 while searching), then up to 8 seated elsewhere. */
export function pickerList(roster: MealRoster, query: string, excludeId?: string): PickerList {
  const q = query.trim().toLowerCase();
  const match = (r: Resident) => !q || `${fullName(r)} ${r.nickname ?? ''}`.toLowerCase().includes(q);
  const waitingAll = [...roster.waiting].sort(byLastName).filter(match);
  const others = q ? roster.coming.filter((r) => roster.seatOf.has(r.id) && r.id !== excludeId && match(r)).sort(byLastName) : [];
  return { waiting: waitingAll.slice(0, q ? 8 : 5), others: others.slice(0, 8), waitingTotal: waitingAll.length };
}

/** Where to open the picker: outside the seat, away from its table, kept inside the room. */
export function pickerPosition(lab: Pick<SeatLabel, 'l' | 't' | 'w' | 'h' | 'nx' | 'ny'>, room: { w: number; h: number }, rows: number, searching: boolean, moreNote: boolean) {
  const W = 250;
  const H = 92 + Math.max(1, rows) * 32 + (searching ? 44 : 0) + (!searching && moreNote ? 22 : 0);
  const cx = lab.l + lab.w / 2;
  const cy = lab.t + lab.h / 2;
  const G = 14;
  const fitsX = (v: number) => v >= 6 && v + W <= room.w - 6;
  const fitsY = (v: number) => v >= 6 && v + H <= room.h - 6;
  const side = () => {
    const r = cx + G;
    const l = cx - G - W;
    return fitsX(r) && (!fitsX(l) || room.w - cx >= cx) ? r : l;
  };
  let x: number;
  let y: number;
  if (Math.abs(lab.ny) >= Math.abs(lab.nx)) {
    // Seat above or below its table: open further out, or beside the seat if there's no room.
    x = cx - W / 2;
    y = lab.ny < 0 ? cy - G - H : cy + G;
    if (!fitsY(y)) {
      x = side();
      y = lab.ny < 0 ? cy - 20 : cy + 20 - H;
    }
  } else {
    y = cy - H / 2;
    x = lab.nx > 0 ? cx + G : cx - G - W;
    if (!fitsX(x)) x = lab.nx > 0 ? cx - G - W : cx + G;
  }
  x = Math.max(6, Math.min(x, room.w - W - 6));
  y = Math.max(6, Math.min(y, room.h - H - 6));
  return { x: Math.round(x), y: Math.round(y), w: W };
}

/** "S1 · T7" for a seat in a multi-section meal, "T7" otherwise. */
export function shortWhere(sectionLabel: string, tableNumber: number): string {
  const m = /^Section (\d+)$/.exec(sectionLabel);
  return m ? `S${m[1]} · T${tableNumber}` : `T${tableNumber}`;
}

// ---- Seat details card ------------------------------------------------------------

export interface DetailRow {
  name: string;
  meta: string;
  dot: string;
}

/** Drinks for this meal, then hot water and RO water, worded like the mockup's Seat details. */
export function detailRows(r: Resident, meal: string, beverages: Beverage[]): DetailRow[] {
  const p = r.prefs[meal as never] as MealPrefs | undefined;
  if (!p) return [];
  // Two of the same juice are poured as one glass: show them as one row.
  const together = pouredTogether(p.drinks);
  const isPair = (d: (typeof p.drinks)[number]) => !!together && d.slot === 'drink' && d.beverage === together;
  const drinks = p.drinks.filter((d) => !isPair(d) || d === p.drinks.find(isPair));
  const rows: DetailRow[] = drinks.map((d) => {
    const bev = beverages.find((b) => b.siteId === r.siteId && b.name === d.beverage);
    const kind = bev?.kind ?? 'other';
    const meta =
      kind === 'coffee'
        ? (d.amount === 'Half' ? 'Half mug' : 'Mug') + (d.creamer ? ' · creamer' : '')
        : kind === 'tea'
          ? `${d.tea ?? 'Tea'} · mug`
          : (kind === 'juice' ? d.drinkware : (d.amount === 'Half' ? 'Half · ' : '') + d.drinkware) + (d.extraGlass ? ' · + water glass' : '');
    const both = isPair(d);
    return { name: both ? `2 × ${d.beverage}` : d.beverage, meta: both ? 'Glass · both poured together' : meta, dot: kind === 'coffee' ? '#6F4E37' : (bev?.color ?? '#FFFFFF') };
  });
  if (p.hotWater) rows.push({ name: 'Hot water', meta: 'Mug', dot: '#FFFFFF' });
  if (p.roWater) rows.push({ name: 'RO water', meta: 'Glass', dot: '#BFDBFE' });
  return rows;
}

/** Only what's unusual: a non-standard chair, a half portion, extras. */
export function detailFacts(r: Resident, meal: string): { label: string; value: string }[] {
  const p = r.prefs[meal as never] as MealPrefs | undefined;
  const out: { label: string; value: string }[] = [];
  if (r.chair !== 'arm') out.push({ label: 'Chair', value: CHAIR_LABEL[r.chair] });
  if (p?.portion === 'Half') out.push({ label: 'Portion', value: 'Half' });
  if (p?.extras.length) out.push({ label: 'Extras', value: p.extras.map(extraText).join(', ') });
  return out;
}
