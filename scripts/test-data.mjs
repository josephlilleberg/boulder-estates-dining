// Copies the real app's data into the test app (npm run test-app:copy), so the test app shows
// today's residents and seating. Read-only on the real data: it's copied with SQLite's own
// backup, which is safe even while the real app is open. The test app should be closed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const base = process.platform === 'win32' ? process.env.APPDATA : join(homedir(), 'Library', 'Application Support');
const real = join(base, 'com.boulderestates.dining', 'dining.sqlite3');
const testDir = join(base, 'com.boulderestates.dining.test');
const test = join(testDir, 'dining.sqlite3');

if (!existsSync(real)) {
  console.error(`No real data found at ${real}`);
  process.exit(1);
}
mkdirSync(testDir, { recursive: true });
for (const f of [test, `${test}-wal`, `${test}-shm`]) rmSync(f, { force: true });
execFileSync('sqlite3', [real, `.backup '${test.replace(/'/g, "''")}'`], { stdio: 'inherit' });
console.log(`Copied your real data into the test app:\n  ${test}`);
