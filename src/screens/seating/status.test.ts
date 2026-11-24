import { describe, expect, it } from 'vitest';
import type { Resident, SeatAssignment } from '../../domain/model';
import { hereDaysText } from '../../domain/labels';
import { setupChanges } from '../../sheets/model';
import { occupantFor } from '../../sheets/pages';
import { mealRoster } from './model';

const person = (id: string, more: Partial<Resident> = {}): Resident => ({
  id, siteId: 'BE', first: id, last: 'Test', nickname: null, chair: 'arm', apt: null, diabetic: false, status: 'here', goneDays: [],
  archived: false, notes: [], attends: ['Dinner'], onPlan: ['Dinner'], prefs: {}, ...more,
});
const seat = (residentId: string, s: number): SeatAssignment => ({ siteId: 'BE', meal: 'Dinner', tableId: 'T1', seat: s, residentId });

describe('gone residents', () => {
  const residents = [person('here'), person('sundays', { goneDays: [0] }), person('gone', { status: 'gone' }), person('goneUnseated', { status: 'gone' }), person('waiting')];
  const seating = [seat('here', 0), seat('sundays', 1), seat('gone', 2)];

  it('keep their seats; gone ones print empty, and those gone certain days print empty on those days', () => {
    const on = (weekday: number) => [0, 1, 2].map((s) => occupantFor({ residents, seating }, 'BE', 'Dinner', weekday)('T1', s)?.id ?? null);
    expect(on(0)).toEqual(['here', null, null]); // a Sunday
    expect(on(1)).toEqual(['here', 'sundays', null]); // a Monday
    expect(mealRoster(residents, seating, 'BE', 'Dinner').seatOf.has('gone')).toBe(true);
  });

  it('can still be seated: anyone on the meal plan without a seat is waiting for one, gone or not', () => {
    expect(mealRoster(residents, seating, 'BE', 'Dinner').waiting.map((r) => r.id)).toEqual(['goneUnseated', 'waiting']);
  });

  it('the setup sheet, reused day to day, shows everyone seated: Gone, or the days part-timers are here', () => {
    const all = occupantFor({ residents, seating }, 'BE', 'Dinner', 'all');
    expect([0, 1, 2].map((s) => all('T1', s)?.id ?? null)).toEqual(['here', 'sundays', 'gone']);
    expect(setupChanges(all('T1', 2)!, 'Dinner').map((c) => c.text)).toEqual(['Gone']);
    expect(setupChanges(all('T1', 1)!, 'Dinner')[0]!.text).toBe('Here M–Sa');
  });

  it('says which days someone is here, briefly', () => {
    expect(hereDaysText([0, 6])).toBe('M–F');
    expect(hereDaysText([0, 2, 4, 6])).toBe('M W F');
    expect(hereDaysText([1, 2, 3, 4, 5])).toBe('Sa Su');
    expect(hereDaysText([0])).toBe('M–Sa');
  });
});
