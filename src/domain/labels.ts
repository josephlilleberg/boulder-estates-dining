// Wording shared by every screen and sheet. Kept identical to the mockup.
import type { Beverage, DiningTable, Drink, Extra, Resident, SeatAssignment } from './model';
import type { MealName, Site } from './sites';
import { getOpening } from './sites';

/** "Section 1 · Table 2 · Seat 4" — the section named as it is at that meal. */
export function seatLabel(site: Site, meal: MealName, seat: Pick<SeatAssignment, 'tableId' | 'seat'>, tables: DiningTable[]): string {
  const t = tables.find((x) => x.id === seat.tableId);
  if (!t) return '';
  const sec = getOpening(site, meal).sections.find((s) => s.section === t.section)?.label ?? `Section ${t.section}`;
  return `${sec} · Table ${t.number} · Seat ${seat.seat + 1}`;
}

/** Second line under a drink on the resident card: "Juice glass", "Glass · Full · Extra glass", "Mug · Full · Creamer". */
export function drinkSubtitle(d: Drink, bev: Beverage | undefined): string {
  const kind = bev?.kind ?? 'other';
  // Juice is always a half glass, so its amount is never shown or asked.
  const parts = kind === 'juice' ? [d.drinkware] : [d.drinkware, d.amount];
  if (kind === 'coffee') parts.push(d.creamer ? 'Creamer' : 'No creamer');
  else if (kind === 'tea') parts.push(d.tea ?? 'Tea');
  else if (d.extraGlass) parts.push('Extra glass');
  return parts.join(' · ');
}

/** "Grape jelly ×2", "Banana", "Napkins ×2", "Big Spoon". */
export function extraText(x: Pick<Extra, 'name' | 'variant' | 'count'>): string {
  if (x.name === 'Fruit') return x.variant ?? 'Fruit';
  if (x.name === 'Jelly') return `${x.variant ? `${x.variant} jelly` : 'Jelly'} ×${x.count}`;
  return `${x.variant ? `${x.variant} ` : ''}${x.name}${x.count > 1 ? ` ×${x.count}` : ''}`;
}

/** "Comes to Breakfast, Dinner" in the site's meal order. */
export function attendanceSummary(r: Resident, site: Site): string {
  const meals = site.meals.map((m) => m.meal).filter((m) => r.attends.includes(m));
  return meals.length ? `Comes to ${meals.join(', ')}` : 'Not coming to any meal';
}
