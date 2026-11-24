import { describe, expect, it } from 'vitest';
import type { Resident, SeatAssignment } from '../../domain/model';
import { occupantFor } from '../../sheets/pages';
import { mealRoster } from './model';

const person = (id: string, more: Partial<Resident> = {}): Resident => ({
  id, siteId: 'BE', first: id, last: 'Test', nickname: null, chair: 'arm', apt: null, diabetic: false, status: 'here', awayUntil: null,
  archived: false, notes: [], attends: ['Dinner'], onPlan: ['Dinner'], prefs: {}, ...more,
});
const seat = (residentId: string, s: number): SeatAssignment => ({ siteId: 'BE', meal: 'Dinner', tableId: 'T1', seat: s, residentId });

describe('away and gone residents', () => {
  const residents = [person('here'), person('away', { status: 'away' }), person('gone', { status: 'gone' }), person('awayUnseated', { status: 'away' }), person('waiting')];
  const seating = [seat('here', 0), seat('away', 1), seat('gone', 2)];

  it('keep their seats, which print empty on the sheets', () => {
    const at = occupantFor({ residents, seating }, 'BE', 'Dinner');
    expect([0, 1, 2].map((s) => at('T1', s)?.id ?? null)).toEqual(['here', null, null]);
    expect(mealRoster(residents, seating, 'BE', 'Dinner').seatOf.has('away')).toBe(true);
  });

  it("aren't waiting to be seated", () => {
    expect(mealRoster(residents, seating, 'BE', 'Dinner').waiting.map((r) => r.id)).toEqual(['waiting']);
  });
});
