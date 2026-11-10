import type { AppData } from '../db/repo';
import type { Beverage, BeverageKind, ExtraOption } from '../domain/model';
import { textColorFor } from '../domain/palette';
import type { MealName, SiteId } from '../domain/sites';
import { del, patch, put, type Op } from './ops';

// Settings edits as (data) → ops; each is one undo step. Catalog rows are
// referenced by name from residents' drinks and extras, so renames carry those
// rows along, and anything still in use can't be removed.

const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const nextSort = (items: { sort: number }[]) => items.reduce((m, x) => Math.max(m, x.sort + 1), 0);

/** The setup sheet's rules key on these cups, so they can't be renamed or removed. */
export const CORE_DRINKWARE = ['Mug', 'Glass', 'Juice glass', 'To-go cup'];

/** Kinds offered for a new drink. Coffee is one built-in drink; tea comes in its own list. */
export const NEW_DRINK_KINDS: { kind: BeverageKind; label: string; cup: string }[] = [
  { kind: 'milk', label: 'Milk', cup: 'Glass' },
  { kind: 'juice', label: 'Juice', cup: 'Juice glass' },
  { kind: 'other', label: 'Something else', cup: 'Glass' },
];

// ---- Usage -------------------------------------------------------------------------

/** Residents (archived included: their drinks are kept) with this drink at any meal. */
export function drinkUsers(data: AppData, siteId: SiteId, name: string): number {
  return data.residents.filter((r) => r.siteId === siteId && Object.values(r.prefs).some((p) => p?.drinks.some((d) => d.beverage === name))).length;
}

export function cupUsers(data: AppData, siteId: SiteId, name: string): number {
  return data.residents.filter((r) => r.siteId === siteId && Object.values(r.prefs).some((p) => p?.drinks.some((d) => d.drinkware === name))).length;
}

const bevRow = (b: Beverage) => ({
  site_id: b.siteId,
  name: b.name,
  kind: b.kind,
  short_label: b.shortLabel,
  color: b.color,
  text_color: b.textColor,
  default_drinkware: b.defaultDrinkware,
  sort: b.sort,
});

function beverage(data: AppData, siteId: SiteId, name: string): Beverage {
  const b = data.beverages.find((x) => x.siteId === siteId && x.name === name);
  if (!b) throw new Error(`Unknown drink ${name}`);
  return b;
}

// ---- Drinks ----------------------------------------------------------------------

export interface NewDrink {
  name: string;
  shortLabel: string;
  kind: BeverageKind;
  color: string;
}

export const addBeverage = (siteId: SiteId, d: NewDrink) => (data: AppData): Op[] => {
  const name = clean(d.name);
  const short = clean(d.shortLabel) || name;
  const site = data.beverages.filter((b) => b.siteId === siteId);
  if (!name) throw new Error('Give the drink a name');
  if (site.some((b) => same(b.name, name))) throw new Error(`${name} is already on the list`);
  const kind = NEW_DRINK_KINDS.find((k) => k.kind === d.kind);
  if (!kind) throw new Error('Pick milk, juice or something else');
  return [
    put('beverage', { site_id: siteId, name, kind: d.kind, short_label: short, color: d.color, text_color: textColorFor(d.color), default_drinkware: kind.cup, sort: nextSort(site) }),
  ];
};

export interface DrinkEdit {
  name?: string;
  shortLabel?: string;
  color?: string;
}

/** Rename (residents' drinks follow), change the printed short name, or the pill colour. */
export const updateBeverage = (siteId: SiteId, name: string, e: DrinkEdit) => (data: AppData): Op[] => {
  const b = beverage(data, siteId, name);
  const next: Beverage = { ...b };
  if (e.shortLabel !== undefined) {
    next.shortLabel = clean(e.shortLabel);
    if (!next.shortLabel) throw new Error('The printed name can’t be empty');
  }
  if (e.color !== undefined) {
    if (b.kind === 'coffee') throw new Error('Coffee isn’t printed, so it has no colour');
    next.color = e.color;
    next.textColor = textColorFor(e.color);
  }
  const newName = e.name !== undefined ? clean(e.name) : b.name;
  if (!newName) throw new Error('Give the drink a name');
  if (newName === b.name) return [put('beverage', bevRow(next))];

  if (data.beverages.some((x) => x.siteId === siteId && x !== b && same(x.name, newName))) throw new Error(`${newName} is already on the list`);
  const ops: Op[] = [put('beverage', bevRow({ ...next, name: newName }))];
  for (const r of data.residents.filter((x) => x.siteId === siteId)) {
    for (const p of Object.values(r.prefs)) for (const d of p?.drinks ?? []) if (d.beverage === b.name) ops.push(patch('drink', { id: d.id }, { beverage: newName }));
  }
  ops.push(del('beverage', { site_id: siteId, name: b.name }));
  return ops;
};

export const removeBeverage = (siteId: SiteId, name: string) => (data: AppData): Op[] => {
  const b = beverage(data, siteId, name);
  if (b.kind === 'coffee') throw new Error('Coffee can’t be removed');
  const n = drinkUsers(data, siteId, name);
  if (n) throw new Error(`${n} resident${n === 1 ? ' has' : 's have'} ${name}. Change their drinks first.`);
  return [del('beverage', { site_id: siteId, name })];
};

// ---- Cups ------------------------------------------------------------------------

export const addDrinkware = (siteId: SiteId, raw: string) => (data: AppData): Op[] => {
  const name = clean(raw);
  const site = data.drinkware.filter((w) => w.siteId === siteId);
  if (!name) throw new Error('Give the cup a name');
  if (site.some((w) => same(w.name, name))) throw new Error(`${name} is already on the list`);
  return [put('drinkware', { site_id: siteId, name, sort: nextSort(site) })];
};

export const removeDrinkware = (siteId: SiteId, name: string) => (data: AppData): Op[] => {
  if (CORE_DRINKWARE.includes(name)) throw new Error(`${name} is used by the setup sheet and can’t be removed`);
  const n = cupUsers(data, siteId, name);
  if (n) throw new Error(`${n} resident${n === 1 ? ' uses' : 's use'} the ${name.toLowerCase()}. Change their drinks first.`);
  if (data.beverages.some((b) => b.siteId === siteId && b.defaultDrinkware === name)) throw new Error(`A drink is served in the ${name.toLowerCase()} by default`);
  return [del('drinkware', { site_id: siteId, name })];
};

// ---- Extras ------------------------------------------------------------------------

export interface ExtraOptionInput {
  name: string;
  variants: string[];
  allMeals: boolean;
  counted: boolean;
}

const optionRow = (siteId: SiteId, x: ExtraOptionInput, sort: number) => ({
  site_id: siteId,
  name: clean(x.name),
  variants: [...new Set(x.variants.map(clean).filter(Boolean))].join('|'),
  all_meals: x.allMeals ? 1 : 0,
  counted: x.counted ? 1 : 0,
  sort,
});

/** Add (`original` null) or change an extra on the "Add an extra" list. Residents' extras keep their wording. */
export const saveExtraOption = (siteId: SiteId, original: string | null, x: ExtraOptionInput) => (data: AppData): Op[] => {
  const name = clean(x.name);
  const site = data.extraOptions.filter((o) => o.siteId === siteId);
  if (!name) throw new Error('Give the extra a name');
  if (name.includes('|')) throw new Error('Names can’t contain “|”');
  const prev: ExtraOption | undefined = original === null ? undefined : site.find((o) => o.name === original);
  if (original !== null && !prev) throw new Error(`Unknown extra ${original}`);
  if (site.some((o) => o !== prev && same(o.name, name))) throw new Error(`${name} is already on the list`);
  const ops: Op[] = [put('extra_option', optionRow(siteId, x, prev?.sort ?? nextSort(site)))];
  if (prev && prev.name !== name) ops.push(del('extra_option', { site_id: siteId, name: prev.name }));
  return ops;
};

export const removeExtraOption = (siteId: SiteId, name: string): Op[] => [del('extra_option', { site_id: siteId, name })];

/** Extras offered on the resident card: the whole list, at every meal (the manager keeps it short). */
export const extrasFor = (data: Pick<AppData, 'extraOptions'>, siteId: SiteId) => data.extraOptions.filter((o) => o.siteId === siteId);

// ---- Meals & sections --------------------------------------------------------------

function opening(data: AppData, siteId: SiteId, meal: MealName) {
  const site = data.sites.find((s) => s.id === siteId);
  const m = site?.meals.find((x) => x.meal === meal);
  if (!m) throw new Error(`${meal} isn’t a meal at this site`);
  return m.sections;
}

/** Seats at this meal on the tables of one physical section. */
export function seatsInSection(data: AppData, siteId: SiteId, meal: MealName, section: number) {
  const tables = new Set(data.tables.filter((t) => t.section === section).map((t) => t.id));
  return data.seating.filter((s) => s.siteId === siteId && s.meal === meal && tables.has(s.tableId));
}

/**
 * Open or close a section's tables for a meal. Closing frees the seats there (those
 * residents go back to waiting) in the same undo step. Every meal keeps one section.
 */
export const setSectionOpen = (siteId: SiteId, meal: MealName, section: number, open: boolean) => (data: AppData): Op[] => {
  const cur = opening(data, siteId, meal);
  const isOpen = cur.some((s) => s.section === section);
  if (open === isOpen) return [];
  if (!open) {
    if (cur.length === 1) throw new Error(`${meal} needs at least one section`);
    return [
      ...seatsInSection(data, siteId, meal, section).map((s) => del('seating', { site_id: siteId, meal, table_id: s.tableId, seat: s.seat })),
      del('meal_section', { site_id: siteId, meal, section }),
    ];
  }
  const taken = new Set(cur.map((s) => s.label.toLowerCase()));
  let label = `Section ${section}`;
  for (let k = 1; taken.has(label.toLowerCase()); k++) label = `Section ${k}`;
  // Tabs and sheets list sections in room order.
  return [
    ...cur.map((s) => patch('meal_section', { site_id: siteId, meal, section: s.section }, { sort: s.section })),
    put('meal_section', { site_id: siteId, meal, section, label, sort: section }),
  ];
};

export const renameSection = (siteId: SiteId, meal: MealName, section: number, raw: string) => (data: AppData): Op[] => {
  const label = clean(raw);
  const cur = opening(data, siteId, meal);
  const s = cur.find((x) => x.section === section);
  if (!s) throw new Error(`Section ${section} isn’t open at ${meal}`);
  if (!label) throw new Error('A section needs a name');
  if (s.label === label) return [];
  if (cur.some((x) => x !== s && same(x.label, label))) throw new Error(`${meal} already has a “${label}”`);
  return [patch('meal_section', { site_id: siteId, meal, section }, { label })];
};

// ---- Backups -------------------------------------------------------------------------

export const setBackupDir = (dir: string): Op[] => [put('meta', { key: 'backup_dir', value: dir })];
