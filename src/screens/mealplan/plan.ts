import { statusText } from '../../domain/labels';
import type { Resident } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { buildList } from '../residents/list';

/** "GONE UNTIL FURTHER NOTICE", or '' (gone on certain weekdays shows on those days only). */
const awayText = (r: Resident): string => (r.status === 'gone' ? statusText(r).toUpperCase() : '');

export interface PlanRow {
  id: string;
  /** "Last, First" (with nickname), as the Residents list shows it. */
  name: string;
  apt: string | null;
  diabetic: boolean;
  /** Gone until further notice: the row says so across the week instead of boxes. Empty otherwise. */
  away: string;
  /** Weekdays they're always gone (0 = Sunday): those days say GONE instead of boxes. */
  goneDays: number[];
  /** One per site meal, in the site's meal order: on the plan for it. */
  plan: boolean[];
}

/** Active residents at the site who are on the plan for at least one meal, last name A–Z. */
export function planRows(residents: Resident[], site: Site): PlanRow[] {
  const meals = site.meals.map((m) => m.meal);
  const on = residents.filter((r) => r.siteId === site.id && !r.archived && r.onPlan.some((m) => meals.includes(m)));
  const byId = new Map(on.map((r) => [r.id, r]));
  return buildList(on, '', 'last').groups.flatMap((g) =>
    g.rows.map(({ id, name }) => {
      const r = byId.get(id)!;
      return { id, name, apt: r.apt, diabetic: r.diabetic, away: awayText(r), goneDays: r.goneDays, plan: meals.map((m) => r.onPlan.includes(m)) };
    }),
  );
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out.length ? out : [[]];
}

// ---- A week runs Sunday to Saturday, like the paper sheet -------------------------

export const weekStart = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const weekDays = (start: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(start, i));

const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });

/** The sheet's "Month:" and "Week Of:" boxes, e.g. "November" and "November 22–28". */
export function weekLabels(start: Date): { month: string; week: string } {
  const end = addDays(start, 6);
  const same = start.getMonth() === end.getMonth();
  return {
    month: same ? monthName(start) : `${monthName(start)} / ${monthName(end)}`,
    week: same ? `${monthName(start)} ${start.getDate()}–${end.getDate()}` : `${monthName(start)} ${start.getDate()} – ${monthName(end)} ${end.getDate()}`,
  };
}

/** A day column's heading, e.g. "Sunday 11-22"; Wednesday is "Wed" to fit, as on the paper sheet. */
export const dayLabel = (d: Date): string => `${d.getDay() === 3 ? 'Wed' : d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getMonth() + 1}-${d.getDate()}`;

/** The meal whose box is the big one in each day (Dinner where there is one). */
export const mainMeal = (meals: MealName[]): number => Math.max(0, meals.indexOf('Dinner'));
