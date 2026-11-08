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

export const shortName = (r: Pick<Resident, 'first' | 'last'>) => `${r.first} ${r.last.charAt(0)}.`;
export const fullName = (r: Pick<Resident, 'first' | 'last'>) => `${r.first} ${r.last}`;
