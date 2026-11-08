import type { AppData } from '../db/repo';
import type { Beverage, Chair, Drink, Extra, Portion, Resident } from '../domain/model';
import type { MealName, SiteId } from '../domain/sites';
import { setAttendance } from './actions';
import { del, patch, put, type Op } from './ops';

// Resident edits as (data) → ops. Each one is a single undo step.

export const MAX_DRINKS = 2; // per meal, not counting breakfast coffee

const newId = () => crypto.randomUUID();
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');

function resident(data: AppData, id: string): Resident {
  const r = data.residents.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown resident ${id}`);
  return r;
}

function findDrink(data: AppData, drinkId: string): { r: Resident; meal: MealName; d: Drink } {
  for (const r of data.residents) {
    for (const [meal, p] of Object.entries(r.prefs) as [MealName, NonNullable<Resident['prefs'][MealName]>][]) {
      const d = p.drinks.find((x) => x.id === drinkId);
      if (d) return { r, meal, d };
    }
  }
  throw new Error(`Unknown drink ${drinkId}`);
}

function findExtra(data: AppData, extraId: string): { r: Resident; meal: MealName; x: Extra } {
  for (const r of data.residents) {
    for (const [meal, p] of Object.entries(r.prefs) as [MealName, NonNullable<Resident['prefs'][MealName]>][]) {
      const x = p.extras.find((e) => e.id === extraId);
      if (x) return { r, meal, x };
    }
  }
  throw new Error(`Unknown extra ${extraId}`);
}

const nextSort = (items: { length: number }) => items.length;

/** meal_pref row exists for every meal a resident comes to; create it lazily for older rows. */
function ensurePref(r: Resident, meal: MealName): Op[] {
  return r.prefs[meal] ? [] : [put('meal_pref', { resident_id: r.id, meal, ro_water: 0, hot_water: 0, portion: 'Full' })];
}

// ---- Resident --------------------------------------------------------------

export interface NewResident {
  siteId: SiteId;
  first: string;
  last: string;
  meals: MealName[];
}

/** Returns the ops and the new id, so the screen can select the new resident. */
export function addResident(n: NewResident): { id: string; ops: (data: AppData) => Op[] } {
  const id = newId();
  const first = clean(n.first);
  const last = clean(n.last);
  return {
    id,
    ops: () => {
      if (!first || !last) throw new Error('First and last name are both needed');
      return [
        put('resident', { id, site_id: n.siteId, first, last, chair: 'arm', archived: 0 }),
        ...n.meals.flatMap((meal) => [
          put('attendance', { resident_id: id, meal }),
          put('meal_pref', { resident_id: id, meal, ro_water: 0, hot_water: 0, portion: 'Full' }),
        ]),
      ];
    },
  };
}

export const renameResident = (id: string, first: string, last: string) => (data: AppData): Op[] => {
  const r = resident(data, id);
  const f = clean(first);
  const l = clean(last);
  if (!f || !l) throw new Error('First and last name are both needed');
  return f === r.first && l === r.last ? [] : [patch('resident', { id }, { first: f, last: l })];
};

export const setChair = (id: string, chair: Chair) => (data: AppData): Op[] =>
  resident(data, id).chair === chair ? [] : [patch('resident', { id }, { chair })];

/** Hides them everywhere and frees their seats. History (drinks, notes, attendance) stays. */
export const archiveResident = (id: string) => (data: AppData): Op[] => {
  const r = resident(data, id);
  if (r.archived) return [];
  const seats = data.seating.filter((s) => s.residentId === id);
  return [
    ...seats.map((s) => del('seating', { site_id: s.siteId, meal: s.meal, table_id: s.tableId, seat: s.seat })),
    patch('resident', { id }, { archived: 1 }),
  ];
};

export const restoreResident = (id: string) => (data: AppData): Op[] =>
  resident(data, id).archived ? [patch('resident', { id }, { archived: 0 })] : [];

// ---- Notes -----------------------------------------------------------------

export const addNote = (residentId: string, text: string) => (data: AppData): Op[] => {
  const r = resident(data, residentId);
  const t = clean(text);
  if (!t) return [];
  return [put('resident_note', { id: newId(), resident_id: residentId, text: t, sort: nextSort(r.notes) })];
};

export const removeNote = (noteId: string) => (): Op[] => [del('resident_note', { id: noteId })];

// ---- Attendance and per-meal flags -----------------------------------------

export { setAttendance };

export const setRoWater = (id: string, meal: MealName, on: boolean) => (data: AppData): Op[] => {
  const r = resident(data, id);
  return [...ensurePref(r, meal), patch('meal_pref', { resident_id: id, meal }, { ro_water: on ? 1 : 0 })];
};

export const setHotWater = (id: string, meal: MealName, on: boolean) => (data: AppData): Op[] => {
  const r = resident(data, id);
  return [...ensurePref(r, meal), patch('meal_pref', { resident_id: id, meal }, { hot_water: on ? 1 : 0 })];
};

export const setPortion = (id: string, meal: MealName, portion: Portion) => (data: AppData): Op[] => {
  const r = resident(data, id);
  if (r.prefs[meal]?.portion === portion) return [];
  return [...ensurePref(r, meal), patch('meal_pref', { resident_id: id, meal }, { portion })];
};

// ---- Drinks ----------------------------------------------------------------

export const TEAS = ['Chamomile', 'Black Tea', 'Green Tea'];

/** Field values a drink takes when its beverage is (re)chosen. */
function drinkDefaults(b: Beverage) {
  return {
    beverage: b.name,
    drinkware: b.defaultDrinkware,
    tea: b.kind === 'tea' ? TEAS[0]! : null,
    amount: 'Full' as Portion,
    creamer: 0,
    extra_glass: 0,
  };
}

function beverage(data: AppData, siteId: SiteId, name: string): Beverage {
  const b = data.beverages.find((x) => x.siteId === siteId && x.name === name);
  if (!b) throw new Error(`Unknown drink "${name}"`);
  return b;
}

export function addDrink(residentId: string, meal: MealName, slot: Drink['slot'], beverageName: string): { id: string; ops: (data: AppData) => Op[] } {
  const id = newId();
  return {
    id,
    ops: (data) => {
      const r = resident(data, residentId);
      const drinks = r.prefs[meal]?.drinks ?? [];
      if (slot === 'coffee') {
        if (meal !== 'Breakfast') throw new Error('Breakfast coffee is only for breakfast');
        if (drinks.some((d) => d.slot === 'coffee')) throw new Error('They already have breakfast coffee');
      } else if (drinks.filter((d) => d.slot === 'drink').length >= MAX_DRINKS) {
        throw new Error(`Up to ${MAX_DRINKS} drinks per meal`);
      }
      const b = beverage(data, r.siteId, slot === 'coffee' ? 'Coffee' : beverageName);
      return [
        ...ensurePref(r, meal),
        put('drink', { id, resident_id: residentId, meal, slot, sort: nextSort(drinks), ...drinkDefaults(b) }),
      ];
    },
  };
}

export interface DrinkPatch {
  beverage?: string;
  tea?: string;
  drinkware?: string;
  amount?: Portion;
  extraGlass?: boolean;
  creamer?: boolean;
}

export const updateDrink = (drinkId: string, p: DrinkPatch) => (data: AppData): Op[] => {
  const { r, d } = findDrink(data, drinkId);
  const set: Record<string, string | number | null> = {};
  if (p.beverage !== undefined && p.beverage !== d.beverage) {
    if (d.slot === 'coffee') throw new Error('Breakfast coffee is always coffee');
    Object.assign(set, drinkDefaults(beverage(data, r.siteId, p.beverage)));
  }
  if (p.tea !== undefined) set.tea = p.tea;
  if (p.drinkware !== undefined) set.drinkware = p.drinkware;
  if (p.amount !== undefined) set.amount = p.amount;
  if (p.extraGlass !== undefined) set.extra_glass = p.extraGlass ? 1 : 0;
  if (p.creamer !== undefined) set.creamer = p.creamer ? 1 : 0;
  return Object.keys(set).length ? [patch('drink', { id: drinkId }, set)] : [];
};

export const removeDrink = (drinkId: string) => (data: AppData): Op[] => {
  findDrink(data, drinkId);
  return [del('drink', { id: drinkId })];
};

// ---- Extras ----------------------------------------------------------------

export interface ExtraInput {
  name: string;
  variant: string | null;
  count: number;
}

function checkExtra(x: ExtraInput): ExtraInput {
  const name = clean(x.name);
  const variant = x.variant ? clean(x.variant) || null : null;
  const count = Math.max(1, Math.min(9, Math.round(x.count)));
  if (!name) throw new Error('An extra needs a name');
  return { name, variant, count };
}

export const addExtra = (residentId: string, meal: MealName, x: ExtraInput) => (data: AppData): Op[] => {
  const r = resident(data, residentId);
  const v = checkExtra(x);
  return [
    ...ensurePref(r, meal),
    put('extra', { id: newId(), resident_id: residentId, meal, sort: nextSort(r.prefs[meal]?.extras ?? []), name: v.name, variant: v.variant, count: v.count }),
  ];
};

export const updateExtra = (extraId: string, x: ExtraInput) => (data: AppData): Op[] => {
  findExtra(data, extraId);
  const v = checkExtra(x);
  return [patch('extra', { id: extraId }, { name: v.name, variant: v.variant, count: v.count })];
};

export const removeExtra = (extraId: string) => (data: AppData): Op[] => {
  findExtra(data, extraId);
  return [del('extra', { id: extraId })];
};
