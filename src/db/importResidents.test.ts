import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { FIXTURE } from '../test/seed';
import { importResidents, parseResidentsFile, residentCount } from './importResidents';
import { migrate } from './migrate';
import { sqljsDb } from './sqljsDb';

const SQL = await initSqlJs();
const text = JSON.stringify(FIXTURE);

describe('residents are imported from a file, never shipped', () => {
  it('a new app has no residents', async () => {
    const db = sqljsDb(SQL);
    await migrate(db);
    expect(await residentCount(db)).toBe(0);
  });

  it('imports the file once, then refuses a second import', async () => {
    const db = sqljsDb(SQL);
    await migrate(db);
    expect(await importResidents(db, parseResidentsFile(text))).toBe(85);
    expect(await residentCount(db)).toBe(85);
    await expect(importResidents(db, parseResidentsFile(text))).rejects.toThrow(/already loaded/);
    expect(await residentCount(db)).toBe(85);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => parseResidentsFile('nope')).toThrow(/isn’t JSON/);
    expect(() => parseResidentsFile('{"rows":[]}')).toThrow(/no residents list/);
    expect(() => parseResidentsFile('{"residents":[],"assign":{}}')).toThrow(/no residents/);
    const bad = structuredClone(FIXTURE);
    bad.residents[0]!.chair = 'Throne' as never;
    expect(() => parseResidentsFile(JSON.stringify(bad))).toThrow(/unknown chair/);
    const orphan = { ...structuredClone(FIXTURE), assign: { 'Dinner|be1-1|0': 'R999' } };
    expect(() => parseResidentsFile(JSON.stringify(orphan))).toThrow(/isn’t in the file/);
  });
});
