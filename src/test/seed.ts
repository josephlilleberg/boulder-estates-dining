import { importResidents } from '../db/importResidents';
import { migrate } from '../db/migrate';
import type { LegacyData } from '../db/seed/importLegacy';
import type { Db } from '../db/types';
import fixture from './fixture-residents.json';

/** Made-up residents with the real data's shape (85 residents, same drinks, seats and tables). */
export const FIXTURE = fixture as LegacyData;

/** A new database plus the made-up residents: what the app holds after "Import residents". */
export async function seedTestDb(db: Db): Promise<void> {
  await migrate(db);
  await importResidents(db, FIXTURE);
}
