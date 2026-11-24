import { describe, expect, it } from 'vitest';
import type { Resident } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { chunk, dayLabel, mainMeal, planRows, weekLabels, weekStart } from './plan';

const site: Site = {
  id: 'BE',
  name: 'Test',
  enabled: true,
  sections: [1],
  meals: (['Breakfast', 'Dinner', 'Supper'] as MealName[]).map((meal) => ({ meal, sections: [{ section: 1, label: 'Section 1' }] })),
};

const person = (id: string, first: string, last: string, onPlan: MealName[], more: Partial<Resident> = {}): Resident => ({
  id, siteId: 'BE', first, last, nickname: null, chair: 'arm', apt: null, diabetic: false, status: 'here', awayUntil: null, archived: false, notes: [], attends: [], onPlan, prefs: {}, ...more,
});

describe('meal plan sheet', () => {
  it('lists active residents on any meal plan at the site, last name A–Z, with their plan per meal', () => {
    const rows = planRows(
      [
        person('a', 'Ann', 'Young', ['Dinner'], { apt: '218A', diabetic: true }),
        person('b', 'Zed', 'Adams', ['Breakfast', 'Dinner']),
        person('c', 'Cal', 'Avery', []),
        person('f', 'Fay', 'Cole', ['Dinner'], { status: 'away', awayUntil: '2027-01-15' }),
        person('g', 'Gus', 'Dunn', ['Dinner'], { status: 'gone' }),
        person('d', 'Dee', 'Baker', ['Dinner'], { archived: true }),
        person('e', 'Eve', 'Brown', ['Dinner'], { siteId: 'HSP' }),
      ],
      site,
    );
    expect(rows).toEqual([
      { id: 'b', name: 'Adams, Zed', apt: null, diabetic: false, away: '', plan: [true, true, false] },
      { id: 'f', name: 'Cole, Fay', apt: null, diabetic: false, away: 'AWAY UNTIL JAN 15', plan: [false, true, false] },
      { id: 'g', name: 'Dunn, Gus', apt: null, diabetic: false, away: 'GONE UNTIL FURTHER NOTICE', plan: [false, true, false] },
      { id: 'a', name: 'Young, Ann', apt: '218A', diabetic: true, away: '', plan: [false, true, false] },
    ]);
  });

  it('runs weeks Sunday to Saturday and labels them like the paper sheet', () => {
    const sun = weekStart(new Date(2026, 10, 25)); // a Wednesday
    expect([sun.getMonth(), sun.getDate(), sun.getDay()]).toEqual([10, 22, 0]);
    expect(weekLabels(sun)).toEqual({ month: 'November', week: 'November 22–28' });
    expect(weekLabels(new Date(2026, 10, 29))).toEqual({ month: 'November / December', week: 'November 29 – December 5' });
    expect(dayLabel(sun)).toBe('Sunday 11-22');
    expect(dayLabel(new Date(2026, 10, 25))).toBe('Wed 11-25');
  });

  it('makes Dinner the big box, and splits long lists into pages', () => {
    expect(mainMeal(['Breakfast', 'Dinner', 'Supper'])).toBe(1);
    expect(mainMeal(['All meals'])).toBe(0);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([[]]);
  });
});
