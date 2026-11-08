import type { Chair } from '../../domain/model';
import type { MealName } from '../../domain/sites';
import { insert } from '../sql';
import type { Stmt } from '../types';

// Converts the old app's data (as embedded in the mockup: `REAL` = dining_data.json
// after the mockup's import) into rows. Pure, so it's unit-tested without a database.

export interface LegacyDrink {
  bev: string;
  cup: string;
  amt: 'Full' | 'Half';
  extra?: boolean;
  creamer?: boolean;
  tea?: string;
  slot?: 'coffee';
}

export interface LegacyResident {
  id: string;
  site: 'BE';
  first: string;
  last: string;
  chair: 'Arms' | 'No arms' | 'Wheelchair';
  notes: string[];
  half: MealName[];
  ro: MealName[];
  hotw: MealName[];
  meals: MealName[];
  drinks: Partial<Record<MealName, LegacyDrink[]>>;
  extras: Partial<Record<MealName, { n: string; v?: string; c?: number }[]>>;
}

export interface LegacyData {
  residents: LegacyResident[];
  /** "Meal|tableId|seatIndex" → resident id */
  assign: Record<string, string>;
}

const CHAIR: Record<LegacyResident['chair'], Chair> = { Arms: 'arm', 'No arms': 'no_arm', Wheelchair: 'none' };

// The old app said "V8"; the catalog name is "V8 Juice" (BRIEF.md drink list).
const BEVERAGE_RENAME: Record<string, string> = { V8: 'V8 Juice' };

const flag = (list: MealName[], meal: MealName) => (list.includes(meal) ? 1 : 0);

export function importLegacy(data: LegacyData): Stmt[] {
  const out: Stmt[] = [];

  for (const r of data.residents) {
    const chair = CHAIR[r.chair];
    if (!chair) throw new Error(`${r.id}: unknown chair "${r.chair}"`);
    out.push(insert('resident', { id: r.id, site_id: r.site, first: r.first, last: r.last, chair, archived: 0 }));
    r.notes.forEach((text, i) => out.push(insert('resident_note', { id: `${r.id}-n${i}`, resident_id: r.id, text, sort: i })));

    // Prefs for every meal mentioned anywhere, attendance only for meals they come to.
    const meals = new Set<MealName>([...r.meals, ...(Object.keys(r.drinks) as MealName[]), ...(Object.keys(r.extras) as MealName[])]);
    for (const meal of meals) {
      if (r.meals.includes(meal)) out.push(insert('attendance', { resident_id: r.id, meal }));
      out.push(
        insert('meal_pref', {
          resident_id: r.id,
          meal,
          ro_water: flag(r.ro, meal),
          hot_water: flag(r.hotw, meal),
          portion: r.half.includes(meal) ? 'Half' : 'Full',
        }),
      );
      (r.drinks[meal] ?? []).forEach((d, i) =>
        out.push(
          insert('drink', {
            id: `${r.id}-${meal}-d${i}`,
            resident_id: r.id,
            meal,
            slot: d.slot === 'coffee' ? 'coffee' : 'drink',
            sort: i,
            beverage: BEVERAGE_RENAME[d.bev] ?? d.bev,
            tea: d.tea ?? null,
            drinkware: d.cup,
            amount: d.amt,
            extra_glass: d.extra ? 1 : 0,
            creamer: d.creamer ? 1 : 0,
          }),
        ),
      );
      (r.extras[meal] ?? []).forEach((x, i) =>
        out.push(insert('extra', { id: `${r.id}-${meal}-x${i}`, resident_id: r.id, meal, sort: i, name: x.n, variant: x.v ?? null, count: x.c ?? 1 })),
      );
    }
  }

  // Seating last: the trigger checks attendance, which is inserted above.
  const siteOf = new Map(data.residents.map((r) => [r.id, r.site]));
  for (const [key, residentId] of Object.entries(data.assign)) {
    const [meal, tableId, seat] = key.split('|');
    if (!meal || !tableId || seat === undefined) throw new Error(`bad seat key ${key}`);
    out.push(insert('seating', { site_id: siteOf.get(residentId) ?? 'BE', meal, table_id: tableId, seat: Number(seat), resident_id: residentId }));
  }
  return out;
}
