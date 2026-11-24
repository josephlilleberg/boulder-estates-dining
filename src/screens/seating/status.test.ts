import { describe, expect, it } from 'vitest';
import type { Resident, SeatAssignment } from '../../domain/model';
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
});
