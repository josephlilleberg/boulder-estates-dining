import type { AppData } from '../db/repo';
import { canHaveExtraGlass, drinkUnits, hasAmount, JUICE_CUPS, MILK_CUPS, tidyName, type Beverage, type Chair, type Drink, type Extra, type Portion, type Resident } from '../domain/model';
import type { MealName, SiteId } from '../domain/sites';
import { defaultCoffeeRow, setAttendance } from './actions';
import { del, patch, put, type Op } from './ops';

// Resident edits as (data) → ops. Each one is a single undo step.

export const MAX_DRINKS = 2; // per meal, not counting breakfast coffee; a full glass of juice uses both

/** Drink slots used at a meal (see drinkUnits). */
export function unitsUsed(data: Pick<AppData, 'beverages'>, siteId: SiteId, drinks: Drink[]): number {
  return drinks.reduce((n, d) => n + drinkUnits(d, data.beverages.find((b) => b.siteId === siteId && b.name === d.beverage)?.kind), 0);
}

/**
 * Adding the same juice again (in a juice glass) makes one full glass instead of a second
 * drink. Returns the drink to turn into a full glass, if that's what adding would do.
 */
export function juiceToMerge(data: Pick<AppData, 'beverages'>, siteId: SiteId, drinks: Drink[], beverageName: string): Drink | undefined {
  const b = data.beverages.find((x) => x.siteId === siteId && x.name === beverageName);
  if (b?.kind !== 'juice') return undefined;
  const slots = drinks.filter((d) => d.slot === 'drink');
  return slots.length === 1 && slots[0]!.beverage === beverageName && slots[0]!.drinkware === 'Juice glass' ? slots[0] : undefined;
}

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
  nickname?: string;
  meals: MealName[];
}

/**
 * Someone else at the site with the same first and last name (ignoring capitals and
 * spacing), archived residents included. Nicknames don't count.
 */
export function duplicateOf(data: Pick<AppData, 'residents'>, siteId: SiteId, first: string, last: string, exceptId?: string): Resident | undefined {
  const key = (f: string, l: string) => `${tidyName(f)} ${tidyName(l)}`.toLowerCase();
  const k = key(first, last);
  return data.residents.find((r) => r.siteId === siteId && r.id !== exceptId && key(r.first, r.last) === k);
}

/** Why a name can't be used, or null. */
export function duplicateMessage(dup: Resident | undefined): string | null {
  if (!dup) return null;
  const name = `${dup.first} ${dup.last}`;
  return dup.archived ? `${name} is already a resident (archived). Restore them from Archived residents instead.` : `${name} is already a resident.`;
}

/** Returns the ops and the new id, so the screen can select the new resident. */
export function addResident(n: NewResident): { id: string; ops: (data: AppData) => Op[] } {
  const id = newId();
  const first = tidyName(n.first);
  const last = tidyName(n.last);
  const nickname = tidyName(n.nickname ?? '') || null;
  return {
    id,
    ops: (data) => {
      if (!first || !last) throw new Error('First and last name are both needed');
      const dup = duplicateMessage(duplicateOf(data, n.siteId, first, last));
      if (dup) throw new Error(dup);
      return [
        put('resident', { id, site_id: n.siteId, first, last, nickname, chair: 'arm', archived: 0 }),
        ...n.meals.flatMap((meal) => [
          put('attendance', { resident_id: id, meal }),
          put('meal_pref', { resident_id: id, meal, ro_water: 0, hot_water: 0, portion: 'Full' }),
          put('drink', defaultCoffeeRow(id, meal)),
        ]),
      ];
    },
  };
}

/** Names are tidied (lowercase words capitalized). Leave the nickname out to keep it; '' clears it. */
export const renameResident = (id: string, first: string, last: string, nickname?: string) => (data: AppData): Op[] => {
  const r = resident(data, id);
  const f = tidyName(first);
  const l = tidyName(last);
  const n = nickname === undefined ? r.nickname : tidyName(nickname) || null;
  if (!f || !l) throw new Error('First and last name are both needed');
  const dup = duplicateMessage(duplicateOf(data, r.siteId, f, l, r.id));
  if (dup) throw new Error(dup);
  return f === r.first && l === r.last && n === r.nickname ? [] : [patch('resident', { id }, { first: f, last: l, nickname: n })];
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

/**
 * Removes them and everything that's theirs (seats, drinks, extras, notes, meals) in one
 * undo step. Children go first so foreign keys hold; Undo puts it all back.
 */
export const deleteResident = (id: string) => (data: AppData): Op[] => {
  const r = resident(data, id);
  const prefs = Object.entries(r.prefs) as [MealName, NonNullable<Resident['prefs'][MealName]>][];
  return [
    ...data.seating.filter((s) => s.residentId === id).map((s) => del('seating', { site_id: s.siteId, meal: s.meal, table_id: s.tableId, seat: s.seat })),
    ...prefs.flatMap(([, p]) => [...p.drinks.map((d) => del('drink', { id: d.id })), ...p.extras.map((x) => del('extra', { id: x.id }))]),
    ...r.notes.map((n) => del('resident_note', { id: n.id })),
    ...r.attends.map((meal) => del('attendance', { resident_id: id, meal })),
    ...prefs.map(([meal]) => del('meal_pref', { resident_id: id, meal })),
    del('resident', { id }),
  ];
};

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

export type SpecialWater = 'none' | 'ro' | 'hot';
export const SPECIAL_WATER: { value: SpecialWater; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'ro', label: 'RO' },
  { value: 'hot', label: 'Hot water' },
];

export const specialWaterOf = (p: { roWater: boolean; hotWater: boolean } | undefined): SpecialWater => (p?.hotWater ? 'hot' : p?.roWater ? 'ro' : 'none');

/** One choice per meal: RO water, a hot water pitcher, or neither. */
export const setSpecialWater = (id: string, meal: MealName, water: SpecialWater) => (data: AppData): Op[] => {
  const r = resident(data, id);
  const cur = r.prefs[meal];
  if (!!cur?.roWater === (water === 'ro') && !!cur?.hotWater === (water === 'hot')) return [];
  return [...ensurePref(r, meal), patch('meal_pref', { resident_id: id, meal }, { ro_water: water === 'ro' ? 1 : 0, hot_water: water === 'hot' ? 1 : 0 })];
};

export const setPortion = (id: string, meal: MealName, portion: Portion) => (data: AppData): Op[] => {
  const r = resident(data, id);
  if (r.prefs[meal]?.portion === portion) return [];
  return [...ensurePref(r, meal), patch('meal_pref', { resident_id: id, meal }, { portion })];
};

// ---- Drinks ----------------------------------------------------------------

export const TEAS = ['Chamomile', 'Black Tea', 'Green Tea'];

/** Field values a drink takes when its beverage is (re)chosen. */
/** Coffee always goes in a mug. */
export const COFFEE_CUP = 'Mug';

function drinkDefaults(b: Beverage) {
  return {
    beverage: b.name,
    drinkware: b.kind === 'coffee' ? COFFEE_CUP : b.defaultDrinkware,
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
      } else if (unitsUsed(data, r.siteId, drinks) >= MAX_DRINKS) {
        throw new Error(`Up to ${MAX_DRINKS} drinks per meal (a full glass of juice counts as 2)`);
      }
      const b = beverage(data, r.siteId, slot === 'coffee' ? 'Coffee' : beverageName);
      return [
        ...ensurePref(r, meal),
        put('drink', { id, resident_id: residentId, meal, slot, sort: nextSort(drinks), ...drinkDefaults(b) }),
      ];
    },
  };
}

/** The Breakfast "Coffee" switch: a mug of coffee that doesn't count toward the 2 drinks. */
export const setBreakfastCoffee = (residentId: string, on: boolean) => (data: AppData): Op[] => {
  const r = resident(data, residentId);
  const coffee = (r.prefs.Breakfast?.drinks ?? []).filter((d) => d.slot === 'coffee');
  if (on) return coffee.length ? [] : [...ensurePref(r, 'Breakfast'), put('drink', defaultCoffeeRow(residentId, 'Breakfast'))];
  return coffee.map((d) => del('drink', { id: d.id }));
};

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
  if (p.drinkware !== undefined && p.drinkware !== d.drinkware) {
    const kind = beverage(data, r.siteId, String(set.beverage ?? d.beverage)).kind;
    if (kind === 'coffee' && p.drinkware !== COFFEE_CUP) throw new Error('Coffee always goes in a mug');
    if (kind === 'milk' && !MILK_CUPS.includes(p.drinkware)) throw new Error('Milk goes in a glass, juice glass, to-go cup or milk pitcher');
    if (kind === 'juice' && !JUICE_CUPS.includes(p.drinkware)) throw new Error('Juice goes in a glass, juice glass or to-go cup');
    set.drinkware = p.drinkware;
    // Only a glass or to-go cup has Full / Half. Juice: a glass starts full (2 drinks) if
    // there's room, otherwise half; a to-go cup starts half (one juice's worth).
    const others = unitsUsed(data, r.siteId, r.prefs[findDrink(data, drinkId).meal]!.drinks.filter((x) => x.id !== drinkId));
    set.amount = kind === 'juice' && p.drinkware === 'Glass' ? (others + 2 <= MAX_DRINKS ? 'Full' : 'Half') : kind === 'juice' && p.drinkware === 'To-go cup' ? 'Half' : 'Full';
  }
  if (p.amount !== undefined) {
    if (p.amount === 'Half' && !hasAmount(String(set.drinkware ?? d.drinkware))) throw new Error('Only a glass or to-go cup can be half');
    set.amount = p.amount;
  }
  if (p.extraGlass !== undefined) set.extra_glass = p.extraGlass ? 1 : 0;
  if (p.creamer !== undefined) set.creamer = p.creamer ? 1 : 0;
  if (!Object.keys(set).length) return [];
  // The drinks as they'll be, to drop any "extra glass" that no longer has a glass beside it
  // (e.g. moved to a to-go cup, or a pair of juices split up).
  const meal = r.prefs[findDrink(data, drinkId).meal]!;
  const after = meal.drinks.map((x) =>
    x.id !== drinkId
      ? x
      : {
          ...x,
          beverage: String(set.beverage ?? x.beverage),
          drinkware: String(set.drinkware ?? x.drinkware),
          amount: (set.amount ?? x.amount) as Portion,
          extraGlass: set.extra_glass !== undefined ? set.extra_glass === 1 : x.extraGlass,
        },
  );
  const self = after.find((x) => x.id === drinkId)!;
  if (p.extraGlass && !canHaveExtraGlass(self, after)) throw new Error('An extra glass goes with a drink in a glass');
  if (unitsUsed(data, r.siteId, after) > MAX_DRINKS) throw new Error('A full glass of juice counts as 2 drinks. Remove the other drink first.');
  const stale = staleExtraGlass(after);
  if (stale.includes(drinkId)) set.extra_glass = 0;
  return [patch('drink', { id: drinkId }, set), ...stale.filter((id) => id !== drinkId).map((id) => patch('drink', { id }, { extra_glass: 0 }))];
};

/** Drinks whose "extra glass" no longer has a glass beside it (see canHaveExtraGlass). */
function staleExtraGlass(after: Drink[]): string[] {
  return after.filter((x) => x.extraGlass && !canHaveExtraGlass(x, after)).map((x) => x.id);
}

export const removeDrink = (drinkId: string) => (data: AppData): Op[] => {
  const { r, meal } = findDrink(data, drinkId);
  const after = r.prefs[meal]!.drinks.filter((x) => x.id !== drinkId);
  return [del('drink', { id: drinkId }), ...staleExtraGlass(after).map((id) => patch('drink', { id }, { extra_glass: 0 }))];
};

// ---- Extras ----------------------------------------------------------------

export interface ExtraInput {
  name: string;
  variant: string | null;
  /** Second choice if the first kind runs out; only with a kind, and never the same one. */
  backup?: string | null;
  count: number;
}

function checkExtra(x: ExtraInput): ExtraInput & { backup: string | null } {
  const name = clean(x.name);
  const variant = x.variant ? clean(x.variant) || null : null;
  const b = x.backup ? clean(x.backup) || null : null;
  const backup = variant && b && b.toLowerCase() !== variant.toLowerCase() ? b : null;
  const count = Math.max(1, Math.min(9, Math.round(x.count)));
  if (!name) throw new Error('An extra needs a name');
  return { name, variant, backup, count };
}

export const addExtra = (residentId: string, meal: MealName, x: ExtraInput) => (data: AppData): Op[] => {
  const r = resident(data, residentId);
  const v = checkExtra(x);
  return [
    ...ensurePref(r, meal),
    put('extra', { id: newId(), resident_id: residentId, meal, sort: nextSort(r.prefs[meal]?.extras ?? []), name: v.name, variant: v.variant, backup: v.backup, count: v.count }),
  ];
};

export const updateExtra = (extraId: string, x: ExtraInput) => (data: AppData): Op[] => {
  findExtra(data, extraId);
  const v = checkExtra(x);
  return [patch('extra', { id: extraId }, { name: v.name, variant: v.variant, backup: v.backup, count: v.count })];
};

export const removeExtra = (extraId: string) => (data: AppData): Op[] => {
  findExtra(data, extraId);
  return [del('extra', { id: extraId })];
};
