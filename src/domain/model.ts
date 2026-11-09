// In-memory shape of everything the screens read. Built from SQLite by db/repo.ts.
import type { MealName, SiteId } from './sites';

export type Chair = 'arm' | 'no_arm' | 'none';
export type Portion = 'Full' | 'Half';
export type Shape = 'round' | 'rect';
export type BeverageKind = 'coffee' | 'tea' | 'milk' | 'juice' | 'other';

// Joe's call: Arm chair / Armless chair / No chair (not the mockup's Regular chair / Wheelchair). Used by the card, Seating and sheet legend.
export const CHAIR_LABEL: Record<Chair, string> = {
  arm: 'Arm chair',
  no_arm: 'Armless chair',
  none: 'No chair',
};

export interface Beverage {
  siteId: SiteId;
  name: string;
  kind: BeverageKind;
  shortLabel: string;
  color: string | null;
  textColor: string;
  defaultDrinkware: string;
  sort: number;
}

export interface Drink {
  id: string;
  slot: 'drink' | 'coffee';
  beverage: string;
  tea: string | null;
  drinkware: string;
  amount: Portion;
  extraGlass: boolean;
  creamer: boolean;
}

/** Only these cups come in Full or Half; a juice glass or a mug is always one serving. */
export const HALF_CUPS = ['Glass', 'To-go cup'];
export const hasAmount = (drinkware: string) => HALF_CUPS.includes(drinkware);

/**
 * Two halves make one: when a resident's two drinks are the same thing in juice glasses
 * (a juice glass is half a glass), or in half to-go cups, they're poured together into one
 * glass or one to-go cup. Returns that cup, or null. Every sheet and screen uses this rule.
 */
export function pouredInto(drinks: Drink[]): 'Glass' | 'To-go cup' | null {
  const d = drinks.filter((x) => x.slot === 'drink');
  const [a, b] = d;
  if (d.length !== 2 || !a || !b || a.beverage !== b.beverage) return null;
  if (a.drinkware === 'Juice glass' && b.drinkware === 'Juice glass') return 'Glass';
  if (a.drinkware === 'To-go cup' && b.drinkware === 'To-go cup' && a.amount === 'Half' && b.amount === 'Half') return 'To-go cup';
  return null;
}

/** The drink poured together (see pouredInto), or null. */
export const pouredTogether = (drinks: Drink[]): string | null => (pouredInto(drinks) ? (drinks.find((x) => x.slot === 'drink')?.beverage ?? null) : null);

export interface Extra {
  id: string;
  name: string;
  variant: string | null;
  count: number;
}

/** One choice offered under "Add an extra", edited in Settings. */
export interface ExtraOption {
  siteId: SiteId;
  name: string;
  variants: string[];
  /** Offered at every meal; otherwise Breakfast only. */
  allMeals: boolean;
  /** Asks "How many" (Fruit doesn't). */
  counted: boolean;
  sort: number;
}

export interface MealPrefs {
  roWater: boolean;
  hotWater: boolean;
  portion: Portion;
  drinks: Drink[];
  extras: Extra[];
}

export interface Note {
  id: string;
  text: string;
}

export interface Resident {
  id: string;
  siteId: SiteId;
  first: string;
  last: string;
  /** What they go by; shown on the seating map and server sheets instead of the first name. */
  nickname: string | null;
  chair: Chair;
  archived: boolean;
  notes: Note[];
  /** Meals they come to. */
  attends: MealName[];
  /** Per meal; present even for meals they've stopped coming to (restored if they return). */
  prefs: Partial<Record<MealName, MealPrefs>>;
}

export interface DiningTable {
  id: string;
  layoutId: string;
  section: number;
  number: number;
  shape: Shape;
  x: number;
  y: number;
  rotation: number;
}

export interface Layout {
  id: string;
  siteId: SiteId;
  name: string;
  active: boolean;
}

export interface SeatAssignment {
  siteId: SiteId;
  meal: MealName;
  tableId: string;
  seat: number;
  residentId: string;
}

/** The name on diagrams (seating map, server sheets): nickname if they have one, plus last initial. */
export const shortName = (r: Pick<Resident, 'first' | 'last'> & { nickname?: string | null }) => `${r.nickname || r.first} ${r.last.charAt(0)}.`;

/**
 * Tidies a typed name: trims, single spaces, and capitalizes words typed all in lowercase
 * ("ella mae" → "Ella Mae", "st. clair" → "St. Clair", "o'neil" → "O'Neil"). Words with any
 * capitals are left as typed, so "McAllister" and "LaVerne" stay right.
 */
export function tidyName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w && w === w.toLowerCase() ? w.replace(/(^|[-'’.])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()) : w))
    .join(' ');
}
export const fullName = (r: Pick<Resident, 'first' | 'last'>) => `${r.first} ${r.last}`;
