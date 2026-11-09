import initSqlJs from 'sql.js';
import { seedTestDb } from '../../test/seed';
import { beforeEach, describe, expect, it } from 'vitest';
import { sqljsDb } from '../../db/sqljsDb';
import { clearSeat, seatResident, setAttendance, type SeatRef } from '../../state/actions';
import { archiveResident } from '../../state/residentActions';
import { Store } from '../../state/store';
import { cropOf, detailFacts, detailRows, mealRoster, pickerList, pickerPosition, seatingScale, seatKey, seatRoom } from './model';

const SQL = await initSqlJs();
let store: Store;

beforeEach(async () => {
  const db = sqljsDb(SQL);
  await seedTestDb(db);
  store = await Store.open(db);
});

const data = () => store.get().data;
const roster = (meal: string) => mealRoster(data().residents, data().seating, 'BE', meal);
const ref = (meal: SeatRef['meal'], tableId: string, seat: number): SeatRef => ({ siteId: 'BE', meal, tableId, seat });
const sectionTables = (n: number) => data().tables.filter((t) => t.layoutId === 'be-everyday' && t.section === n);
const emptySeat = (meal: SeatRef['meal'], section: number) => {
  const r = roster(meal);
  for (const t of sectionTables(section)) for (let i = 0; i < (t.shape === 'round' ? 4 : 6); i++) if (!r.bySeat.has(seatKey(t.id, i))) return ref(meal, t.id, i);
  throw new Error('no empty seat');
};

describe('Step 5 check: one resident per seat per meal; residents who don’t come can’t be seated', () => {
  it('seeded seating already obeys both rules', () => {
    for (const meal of ['Breakfast', 'Dinner', 'Supper']) {
      const rows = data().seating.filter((s) => s.meal === meal);
      expect(new Set(rows.map((s) => seatKey(s.tableId, s.seat))).size).toBe(rows.length);
      expect(new Set(rows.map((s) => s.residentId)).size).toBe(rows.length);
      for (const s of rows) expect(data().residents.find((r) => r.id === s.residentId)!.attends).toContain(meal);
    }
  });

  it('seating a waiting resident from the picker; Undo unseats them', async () => {
    const who = pickerList(roster('Dinner'), '').waiting[0]!;
    const seat = emptySeat('Dinner', 1);
    await store.change('Seat', seatResident(seat, who.id));
    expect(roster('Dinner').bySeat.get(seatKey(seat.tableId, seat.seat))?.id).toBe(who.id);
    expect(roster('Dinner').waiting.map((r) => r.id)).not.toContain(who.id);
    await store.undoLast();
    expect(roster('Dinner').seatOf.has(who.id)).toBe(false);
  });

  it('picking someone seated elsewhere moves them (never two seats)', async () => {
    const a = data().seating.find((s) => s.meal === 'Dinner')!;
    const seat = emptySeat('Dinner', 3);
    await store.change('Move', seatResident(seat, a.residentId));
    expect(data().seating.filter((s) => s.meal === 'Dinner' && s.residentId === a.residentId)).toEqual([expect.objectContaining({ tableId: seat.tableId, seat: seat.seat })]);
  });

  it('dropping a name on an occupied seat swaps the two', async () => {
    const [a, b] = data().seating.filter((s) => s.meal === 'Dinner');
    await store.change('Swap', seatResident(ref('Dinner', b!.tableId, b!.seat), a!.residentId));
    const r = roster('Dinner');
    expect(r.bySeat.get(seatKey(b!.tableId, b!.seat))?.id).toBe(a!.residentId);
    expect(r.bySeat.get(seatKey(a!.tableId, a!.seat))?.id).toBe(b!.residentId);
  });

  it('the picker only offers people who come to the meal', async () => {
    const coming = new Set(roster('Supper').coming.map((r) => r.id));
    const all = pickerList(roster('Supper'), 'a');
    for (const r of [...all.waiting, ...all.others]) expect(coming.has(r.id)).toBe(true);
    const notComing = data().residents.find((r) => !r.attends.includes('Supper') && !r.archived)!;
    expect(pickerList(roster('Supper'), notComing.first + ' ' + notComing.last).waiting).toHaveLength(0);
    await expect(store.change('Seat', seatResident(emptySeat('Supper', 2), notComing.id))).rejects.toThrow(/doesn't come/);
  });

  it('a closed section can’t be seated (Breakfast opens Section 2 only)', async () => {
    const who = roster('Breakfast').waiting[0] ?? roster('Breakfast').coming[0]!;
    await expect(store.change('Seat', seatResident(ref('Breakfast', sectionTables(1)[0]!.id, 0), who.id))).rejects.toThrow(/isn't open/);
  });

  it('turning attendance off or archiving frees the seat', async () => {
    const [a, b] = data().seating.filter((s) => s.meal === 'Dinner');
    await store.change('Off', setAttendance(a!.residentId, 'Dinner', false));
    await store.change('Archive', archiveResident(b!.residentId));
    expect(roster('Dinner').bySeat.has(seatKey(a!.tableId, a!.seat))).toBe(false);
    expect(roster('Dinner').bySeat.has(seatKey(b!.tableId, b!.seat))).toBe(false);
    expect(roster('Dinner').coming.map((r) => r.id)).not.toContain(b!.residentId);
  });

  it('Clear seat puts them back on the waiting list', async () => {
    const a = data().seating.find((s) => s.meal === 'Dinner')!;
    await store.change('Clear', clearSeat(ref('Dinner', a.tableId, a.seat)));
    expect(roster('Dinner').waiting.map((r) => r.id)).toContain(a.residentId);
  });
});

describe('picker lists', () => {
  it('no search: up to 5 waiting, by last name; search adds “Seated elsewhere”', async () => {
    // Free up a few seats so there are more than 5 waiting.
    for (const s of data().seating.filter((x) => x.meal === 'Dinner').slice(0, 8)) await store.change('Clear', clearSeat(ref('Dinner', s.tableId, s.seat)));
    const r = roster('Dinner');
    const p = pickerList(r, '');
    expect(p.waiting).toHaveLength(5);
    expect(p.waitingTotal).toBe(r.waiting.length);
    expect(p.others).toHaveLength(0);
    const names = p.waiting.map((x) => x.last + x.first);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

    const seated = r.coming.find((x) => r.seatOf.has(x.id))!;
    const q = pickerList(r, seated.last.toLowerCase());
    expect(q.others.map((x) => x.id)).toContain(seated.id);
  });
});

describe('room drawing', () => {
  it('crops to the section and fills the card width', () => {
    const crop = cropOf(sectionTables(1))!;
    expect(crop.w).toBeGreaterThan(0);
    const sc = seatingScale(crop, 900, 860);
    expect(crop.w * sc).toBeLessThanOrEqual(896);
    expect(sc).toBeGreaterThanOrEqual(0.45);
  });

  it('one label per seat; names 12 px, shrinking for long names but never below 9.5', () => {
    const tables = sectionTables(1);
    const r = roster('Dinner');
    const crop = cropOf(tables);
    const room = seatRoom(tables, seatingScale(crop, 900, 860), crop, (k) => r.bySeat.get(k) ?? null, false);
    expect(room.labels).toHaveLength(34);
    const named = room.labels.filter((l) => l.resident);
    expect(named.length).toBeGreaterThan(0);
    for (const l of named) expect(l.fontSize).toBeGreaterThanOrEqual(9.5);
    for (const l of named) expect(l.fontSize).toBeLessThanOrEqual(12);
    for (const l of room.labels.filter((x) => !x.resident)) expect([l.w, l.h]).toEqual([16, 16]);
    // Names are never upside down.
    for (const l of named) expect(Math.abs(l.angle)).toBeLessThanOrEqual(90);
  });

  it('the picker stays inside the room', () => {
    const room = { w: 700, h: 500 };
    for (const lab of [
      { l: 5, t: 5, w: 16, h: 16, nx: 0, ny: -1 },
      { l: 680, t: 480, w: 16, h: 16, nx: 1, ny: 0 },
      { l: 340, t: 240, w: 16, h: 16, nx: -1, ny: 0 },
    ]) {
      const p = pickerPosition(lab, room, 5, false, true);
      expect(p.x).toBeGreaterThanOrEqual(6);
      expect(p.y).toBeGreaterThanOrEqual(6);
      expect(p.x + p.w).toBeLessThanOrEqual(room.w - 6);
    }
  });
});

describe('Seat details', () => {
  it('lists drinks with colour dots and only the unusual facts', () => {
    const r = data().residents.find((x) => x.prefs.Dinner?.drinks.some((d) => d.beverage.includes('Juice')))!;
    const rows = detailRows(r, 'Dinner', data().beverages);
    const juice = rows.find((x) => x.name.includes('Juice'))!;
    expect(juice.dot).toMatch(/^#[0-9A-F]{6}$/i);
    expect(juice.meta).not.toMatch(/Half/); // juice amount is never shown

    const plain = data().residents.find((x) => x.chair === 'arm' && x.prefs.Dinner?.portion === 'Full' && !x.prefs.Dinner.extras.length)!;
    expect(detailFacts(plain, 'Dinner')).toEqual([]);
    const special = data().residents.find((x) => x.chair !== 'arm')!;
    expect(detailFacts(special, 'Dinner')[0]?.label).toBe('Chair');
  });

  it('two of the same juice show as one row, poured together in a glass', () => {
    const r = structuredClone(data().residents.find((x) => x.prefs.Dinner)!);
    const jg = { slot: 'drink' as const, beverage: 'Cranberry Juice', tea: null, drinkware: 'Juice glass', amount: 'Full' as const, extraGlass: false, creamer: false };
    r.prefs.Dinner!.drinks = [{ id: 'a', ...jg }, { id: 'b', ...jg }];
    r.prefs.Dinner!.hotWater = false;
    r.prefs.Dinner!.roWater = false;
    expect(detailRows(r, 'Dinner', data().beverages).map((x) => [x.name, x.meta])).toEqual([['2 × Cranberry Juice', 'Glass · both poured together']]);
  });
});
