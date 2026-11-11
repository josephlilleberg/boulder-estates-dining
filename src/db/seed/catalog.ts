import type { BeverageKind } from '../../domain/model';
import type { MealName, SiteId } from '../../domain/sites';
import { insert } from '../sql';
import type { Stmt } from '../types';
import tables from './tables.json';

// First-run configuration. After seeding, the database is the source of truth
// and Settings edits it; this file is never read again.

interface SiteSeed {
  id: SiteId;
  name: string;
  enabled: boolean;
  meals: { meal: MealName; sections: [number, string][] }[];
}

const SITES: SiteSeed[] = [
  {
    id: 'BE',
    name: 'Boulder Estates',
    enabled: true,
    meals: [
      // Breakfast and Supper open only the Section 2 tables, called "Section 1".
      { meal: 'Breakfast', sections: [[2, 'Section 1']] },
      { meal: 'Dinner', sections: [[1, 'Section 1'], [2, 'Section 2'], [3, 'Section 3']] },
      { meal: 'Supper', sections: [[2, 'Section 1']] },
    ],
  },
  {
    id: 'HSP',
    name: 'Hill Street Place',
    enabled: false, // v1 is Boulder Estates only
    meals: [{ meal: 'All meals', sections: [[1, 'Dining room']] }],
  },
];

// [name, kind, short label (what the server sheet prints; juices drop "Juice", the colour says it), colour, text colour]. Colours from BRIEF.md "Drink colours".
type Bev = [string, BeverageKind, string, string | null, string];
const BEVERAGES: Bev[] = [
  ['Coffee', 'coffee', 'Coffee', null, '#000000'],
  ['Tea', 'tea', 'Tea', '#6BD586', '#000000'],
  ['2% Milk', 'milk', '2% Milk', '#6AB3FD', '#000000'],
  ['Skim Milk', 'milk', 'Skim Milk', '#F0B4CA', '#000000'],
  ['Chocolate Milk', 'milk', 'Choc. Milk', '#D69A72', '#000000'],
  ['Orange Juice', 'juice', 'Orange', '#FFA14B', '#000000'],
  ['Apple Juice', 'juice', 'Apple', '#F2DD5A', '#000000'],
  ['Cranberry Juice', 'juice', 'Cranberry', '#C11749', '#FFFFFF'],
  ['V8 Juice', 'juice', 'V8', '#FF8179', '#000000'],
  ['Prune Juice', 'juice', 'Prune', '#B995F6', '#000000'],
];

const DRINKWARE = ['Mug', 'Glass', 'Juice glass', 'To-go cup', 'Milk pitcher'];

/** Juices default to a juice glass, milks to a glass, coffee and tea to a mug. */
const defaultDrinkware = (kind: BeverageKind) =>
  kind === 'juice' ? 'Juice glass' : kind === 'milk' ? 'Glass' : kind === 'other' ? 'Glass' : 'Mug';

export function catalogStmts(): Stmt[] {
  const out: Stmt[] = [];
  SITES.forEach((s, si) => {
    out.push(insert('site', { id: s.id, name: s.name, enabled: s.enabled ? 1 : 0, sort: si }));
    s.meals.forEach((m, mi) => {
      out.push(insert('site_meal', { site_id: s.id, meal: m.meal, sort: mi }));
      m.sections.forEach(([section, label], k) =>
        out.push(insert('meal_section', { site_id: s.id, meal: m.meal, section, label, sort: k })),
      );
    });

    const layoutId = `${s.id.toLowerCase()}-everyday`;
    out.push(insert('layout', { id: layoutId, site_id: s.id, name: 'Everyday', active: 1 }));
    for (const t of tables[s.id]) {
      out.push(insert('dining_table', { ...t, layout_id: layoutId }));
    }

    // HSP gets the same drink lists for now; Settings will let them differ.
    BEVERAGES.forEach(([name, kind, short_label, color, text_color], i) =>
      out.push(insert('beverage', { site_id: s.id, name, kind, short_label, color, text_color, default_drinkware: defaultDrinkware(kind), sort: i })),
    );
    DRINKWARE.forEach((name, i) => out.push(insert('drinkware', { site_id: s.id, name, sort: i })));
  });
  return out;
}

export const SEED_SITE_IDS = SITES.map((s) => s.id);

// [name, variants, offered at every meal, counted]. The resident card's starting
// extras; Dinner and Supper are napkins only (mockup rule). Seeded by migration 2.
const EXTRAS: [string, string[], boolean, boolean][] = [
  ['Napkins', [], true, true],
  ['Jelly', ['Grape', 'Mixed Fruit', 'Strawberry'], false, true],
  ['Fruit', ['Banana', 'Orange', 'Apple'], false, false],
  ['Butter', [], false, true],
  ['Soup Spoon', [], false, true],
  ['Brown Sugar', [], false, true],
];

export function extraOptionStmts(siteIds: string[]): Stmt[] {
  return siteIds.flatMap((site_id) =>
    EXTRAS.map(([name, variants, all, counted], sort) =>
      insert('extra_option', { site_id, name, variants: variants.join('|'), all_meals: all ? 1 : 0, counted: counted ? 1 : 0, sort }),
    ),
  );
}
