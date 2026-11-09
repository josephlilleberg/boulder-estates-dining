import type { Beverage, BeverageKind, ExtraOption, Chair, DiningTable, Layout, MealPrefs, Portion, Resident, SeatAssignment, Shape } from '../domain/model';
import type { MealName, Site, SiteId } from '../domain/sites';
import type { Db } from './types';

/** Everything the UI reads. Reloaded from SQLite after every change, so it can't drift from disk. */
export interface AppData {
  sites: Site[];
  layouts: Layout[];
  /** Tables of each site's active layout. */
  tables: DiningTable[];
  beverages: Beverage[];
  drinkware: { siteId: SiteId; name: string; sort: number }[];
  extraOptions: ExtraOption[];
  residents: Resident[];
  seating: SeatAssignment[];
  settings: Record<string, string>;
}

const bool = (v: unknown) => v === 1 || v === true;

export async function loadAll(db: Db): Promise<AppData> {
  const [sites, meals, sections, layouts, tables, bevs, ware, xopts, res, notes, att, prefs, drinks, extras, seats, meta] = await Promise.all([
    db.select<{ id: SiteId; name: string; enabled: number }>(`SELECT * FROM site ORDER BY sort`),
    db.select<{ site_id: SiteId; meal: MealName }>(`SELECT * FROM site_meal ORDER BY site_id, sort`),
    db.select<{ site_id: SiteId; meal: MealName; section: number; label: string }>(`SELECT * FROM meal_section ORDER BY site_id, meal, sort`),
    db.select<{ id: string; site_id: SiteId; name: string; active: number }>(`SELECT * FROM layout`),
    db.select<{ id: string; layout_id: string; section: number; number: number; shape: Shape; x: number; y: number; rotation: number }>(
      `SELECT t.* FROM dining_table t JOIN layout l ON l.id = t.layout_id WHERE l.active = 1 ORDER BY t.section, t.number`,
    ),
    db.select<{ site_id: SiteId; name: string; kind: BeverageKind; short_label: string; color: string | null; text_color: string; default_drinkware: string; sort: number }>(
      `SELECT * FROM beverage ORDER BY site_id, sort`,
    ),
    db.select<{ site_id: SiteId; name: string; sort: number }>(`SELECT * FROM drinkware ORDER BY site_id, sort`),
    db.select<{ site_id: SiteId; name: string; variants: string; all_meals: number; counted: number; sort: number }>(`SELECT * FROM extra_option ORDER BY site_id, sort`),
    db.select<{ id: string; site_id: SiteId; first: string; last: string; nickname: string | null; chair: Chair; archived: number }>(`SELECT * FROM resident ORDER BY last, first`),
    db.select<{ id: string; resident_id: string; text: string }>(`SELECT * FROM resident_note ORDER BY resident_id, sort`),
    db.select<{ resident_id: string; meal: MealName }>(`SELECT a.* FROM attendance a JOIN site_meal m ON m.meal = a.meal JOIN resident r ON r.id = a.resident_id AND r.site_id = m.site_id ORDER BY a.resident_id, m.sort`),
    db.select<{ resident_id: string; meal: MealName; ro_water: number; hot_water: number; portion: Portion }>(`SELECT * FROM meal_pref`),
    db.select<{ id: string; resident_id: string; meal: MealName; slot: 'drink' | 'coffee'; beverage: string; tea: string | null; drinkware: string; amount: Portion; extra_glass: number; creamer: number }>(
      `SELECT * FROM drink ORDER BY resident_id, meal, sort`,
    ),
    db.select<{ id: string; resident_id: string; meal: MealName; name: string; variant: string | null; count: number }>(`SELECT * FROM extra ORDER BY resident_id, meal, sort`),
    db.select<{ site_id: SiteId; meal: MealName; table_id: string; seat: number; resident_id: string }>(`SELECT * FROM seating ORDER BY site_id, meal, table_id, seat`),
    db.select<{ key: string; value: string }>(`SELECT * FROM meta`),
  ]);

  const activeTables = tables.map((t): DiningTable => ({ id: t.id, layoutId: t.layout_id, section: t.section, number: t.number, shape: t.shape, x: t.x, y: t.y, rotation: t.rotation }));
  const layoutSite = new Map(layouts.map((l) => [l.id, l.site_id]));

  const siteList: Site[] = sites.map((s) => ({
    id: s.id,
    name: s.name,
    enabled: bool(s.enabled),
    meals: meals
      .filter((m) => m.site_id === s.id)
      .map((m) => ({ meal: m.meal, sections: sections.filter((x) => x.site_id === s.id && x.meal === m.meal).map((x) => ({ section: x.section, label: x.label })) })),
    sections: [...new Set(activeTables.filter((t) => layoutSite.get(t.layoutId) === s.id).map((t) => t.section))].sort((a, b) => a - b),
  }));

  const byId = new Map<string, Resident>();
  for (const r of res) {
    byId.set(r.id, { id: r.id, siteId: r.site_id, first: r.first, last: r.last, nickname: r.nickname || null, chair: r.chair, archived: bool(r.archived), notes: [], attends: [], prefs: {} });
  }
  const pref = (rid: string, meal: MealName): MealPrefs | undefined => byId.get(rid)?.prefs[meal];
  for (const n of notes) byId.get(n.resident_id)?.notes.push({ id: n.id, text: n.text });
  for (const a of att) byId.get(a.resident_id)?.attends.push(a.meal);
  for (const p of prefs) {
    const r = byId.get(p.resident_id);
    if (r) r.prefs[p.meal] = { roWater: bool(p.ro_water), hotWater: bool(p.hot_water), portion: p.portion, drinks: [], extras: [] };
  }
  for (const d of drinks) {
    pref(d.resident_id, d.meal)?.drinks.push({ id: d.id, slot: d.slot, beverage: d.beverage, tea: d.tea, drinkware: d.drinkware, amount: d.amount, extraGlass: bool(d.extra_glass), creamer: bool(d.creamer) });
  }
  for (const x of extras) pref(x.resident_id, x.meal)?.extras.push({ id: x.id, name: x.name, variant: x.variant, count: x.count });

  return {
    sites: siteList,
    layouts: layouts.map((l) => ({ id: l.id, siteId: l.site_id, name: l.name, active: bool(l.active) })),
    tables: activeTables,
    beverages: bevs.map((b) => ({ siteId: b.site_id, name: b.name, kind: b.kind, shortLabel: b.short_label, color: b.color, textColor: b.text_color, defaultDrinkware: b.default_drinkware, sort: b.sort })),
    drinkware: ware.map((w) => ({ siteId: w.site_id, name: w.name, sort: w.sort })),
    extraOptions: xopts.map((x) => ({ siteId: x.site_id, name: x.name, variants: x.variants ? x.variants.split('|') : [], allMeals: bool(x.all_meals), counted: bool(x.counted), sort: x.sort })),
    residents: [...byId.values()],
    seating: seats.map((s) => ({ siteId: s.site_id, meal: s.meal, tableId: s.table_id, seat: s.seat, residentId: s.resident_id })),
    settings: Object.fromEntries(meta.map((m) => [m.key, m.value])),
  };
}
