// Site configuration types. Data lives in SQLite (seeded from db/seed/catalog.ts);
// screens read it through these types only.

export type SiteId = 'BE' | 'HSP';
export type MealName = 'Breakfast' | 'Dinner' | 'Supper' | 'All meals';

/** One open section for a meal: which physical section's tables, and what it's called at that meal. */
export interface OpenSection {
  section: number;
  label: string;
}

export interface MealOpening {
  meal: MealName;
  sections: OpenSection[];
}

export interface Site {
  id: SiteId;
  name: string;
  /** Hidden from the site switch when false (HSP in v1). */
  enabled: boolean;
  meals: MealOpening[];
  /** Physical sections in the room; Room Designer edits these regardless of meal. */
  sections: number[];
}

export const DEFAULT_SITE: SiteId = 'BE';
export const DEFAULT_MEAL: MealName = 'Dinner';

export function getOpening(site: Site, meal: MealName): MealOpening {
  return site.meals.find((m) => m.meal === meal) ?? site.meals[0]!;
}
