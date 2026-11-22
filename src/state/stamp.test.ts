import initSqlJs from 'sql.js';
import { expect, it } from 'vitest';
import { sqljsDb } from '../db/sqljsDb';
import { seedTestDb } from '../test/seed';
import { setChair } from './residentActions';
import { SHEETS_UPDATED, Store } from './store';

const SQL = await initSqlJs();

it('a change stamps when the sheets last changed, and undo puts the old date back', async () => {
  const db = sqljsDb(SQL);
  await seedTestDb(db);
  const store = await Store.open(db);
  const before = store.get().data.settings[SHEETS_UPDATED];
  const r = store.get().data.residents[0]!;
  await store.change('Chair', setChair(r.id, 'none'));
  const at = store.get().data.settings[SHEETS_UPDATED];
  expect(at).toBeDefined();
  expect(Date.now() - Date.parse(at!)).toBeLessThan(60_000);
  await store.undoLast();
  expect(store.get().data.settings[SHEETS_UPDATED]).toBe(before);
});
