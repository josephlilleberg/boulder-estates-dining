import { describe, expect, it } from 'vitest';
import type { DiningEvent } from '../domain/model';
import { upcomingEvent } from './TopBar';

const ev = (date: string, siteId = 'be') => ({ id: date, siteId, date }) as DiningEvent;
const now = new Date(2026, 11, 20); // Sun, Dec 20

describe('upcomingEvent', () => {
  it('names the soonest event within a week, today included', () => {
    expect(upcomingEvent([ev('2026-12-31'), ev('2026-12-24'), ev('2026-12-25')], 'be', now)).toBe('Dec 24');
    expect(upcomingEvent([ev('2026-12-20')], 'be', now)).toBe('Dec 20');
    expect(upcomingEvent([ev('2026-12-27')], 'be', now)).toBe('Dec 27');
  });

  it('ignores past events, ones more than a week out, and other sites', () => {
    expect(upcomingEvent([ev('2026-12-19'), ev('2026-12-28'), ev('2026-12-22', 'hsp')], 'be', now)).toBeNull();
  });
});
