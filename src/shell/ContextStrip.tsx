import type { MealName, Site, SiteId } from '../domain/sites';
import { Segmented } from './Segmented';

interface Props {
  sites: Site[];
  site: Site;
  meal: MealName;
  showMeals: boolean;
  onSite: (id: SiteId) => void;
  onMeal: (meal: MealName) => void;
}

// Site + meal switch under the top bar, shared by every screen except Room Designer and Settings.
export function ContextStrip({ sites, site, meal, showMeals, onSite, onMeal }: Props) {
  const siteOpts = sites.filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name }));
  const meals = site.meals.map((m) => ({ value: m.meal, label: m.meal }));

  return (
    <div className="strip">
      <Segmented label="Dining room" options={siteOpts} value={site.id} onChange={onSite} />
      {showMeals && <Segmented label="Meal" options={meals} value={meal} onChange={onMeal} />}
    </div>
  );
}
