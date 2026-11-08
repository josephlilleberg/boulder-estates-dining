// Builds both installers, signs the update bundles, and publishes a GitHub release
// with latest.json, which the app's "Update" button reads.
//
//   npm run release -- "What's new in this version"
//
// Needs: a clean, pushed main branch; the version bumped in package.json,
// src-tauri/tauri.conf.json and src-tauri/Cargo.toml; the updater key at
// ~/.tauri/boulder-estates-dining.key (keep a backup; without it, installed apps
// can't be updated).

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO = 'josephlilleberg/boulder-estates-dining';
const KEY = join(homedir(), '.tauri', 'boulder-estates-dining.key');
const root = new URL('..', import.meta.url).pathname;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

const notes = process.argv.slice(2).join(' ').trim();
if (!notes) fail('Give release notes: npm run release -- "What changed"');
if (!existsSync(KEY)) fail(`Updater key not found at ${KEY}`);

const version = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version;
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const cargoVersion = readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8').match(/^version = "(.+)"/m)?.[1];
if (pkgVersion !== version || cargoVersion !== version) fail(`Versions differ: tauri.conf ${version}, package.json ${pkgVersion}, Cargo.toml ${cargoVersion}`);
const tag = `v${version}`;
if (out('git', ['tag', '-l', tag]) || out('gh', ['release', 'list', '--repo', REPO, '--json', 'tagName', '-q', `.[] | select(.tagName=="${tag}") | .tagName`]))
  fail(`${tag} already exists. Bump the version first.`);
if (out('git', ['status', '--porcelain'])) fail('Commit your changes first.');
run('git', ['fetch', '-q', 'origin', 'main']);
if (out('git', ['rev-parse', 'HEAD']) !== out('git', ['rev-parse', 'origin/main'])) fail('Push main first (local and GitHub differ).');

run('npm', ['test']);

const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(KEY, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' };
run('npm', ['run', 'build:mac'], { env });
run('npm', ['run', 'build:win'], { env });

// Resident data must never ship. If the private data file is here, make sure none of it got bundled.
const privateData = join(root, 'src/db/seed/legacy-be.json');
if (existsSync(privateData)) {
  const names = JSON.parse(readFileSync(privateData, 'utf8')).residents.map((r) => r.last).filter((n) => n.length > 3);
  for (const f of readdirSync(join(root, 'dist/assets')).filter((f) => f.endsWith('.js'))) {
    const js = readFileSync(join(root, 'dist/assets', f), 'utf8');
    if (names.some((n) => js.includes(n))) fail(`Resident names found in dist/assets/${f}. Not publishing.`);
  }
}

const mac = join(root, 'src-tauri/target/aarch64-apple-darwin/release/bundle');
const win = join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis');
const name = `Boulder.Estates.Dining_${version}`;
const files = {
  dmg: [join(mac, 'dmg', `Boulder Estates Dining_${version}_aarch64.dmg`), `${name}_aarch64.dmg`],
  macUpdate: [join(mac, 'macos', 'Boulder Estates Dining.app.tar.gz'), `${name}_aarch64.app.tar.gz`],
  exe: [join(win, `Boulder Estates Dining_${version}_x64-setup.exe`), `${name}_x64-setup.exe`],
};
for (const [src] of Object.values(files)) if (!existsSync(src)) fail(`Missing build output: ${src}`);
const sig = (src) => {
  if (!existsSync(`${src}.sig`)) fail(`Missing update signature: ${src}.sig`);
  return readFileSync(`${src}.sig`, 'utf8').trim();
};

const stage = join(root, 'src-tauri/target/release-upload');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const [src, dest] of Object.values(files)) copyFileSync(src, join(stage, dest));

const url = (file) => `https://github.com/${REPO}/releases/download/${tag}/${file}`;
writeFileSync(
  join(stage, 'latest.json'),
  JSON.stringify(
    {
      version,
      notes,
      pub_date: new Date().toISOString(),
      platforms: {
        'darwin-aarch64': { signature: sig(files.macUpdate[0]), url: url(files.macUpdate[1]) },
        'windows-x86_64': { signature: sig(files.exe[0]), url: url(files.exe[1]) },
      },
    },
    null,
    2,
  ),
);

const body = `${notes}

**Already installed?** Click **Update** in the app (top bar, or Settings → App updates).

**New install**
- **Windows:** run the setup.exe. If Windows says “Windows protected your PC”, click More info → Run anyway.
- **Mac (Apple Silicon):** open the .dmg and drag the app onto Applications. The first time, go to System Settings → Privacy & Security → Open Anyway.

New installs start empty: load residents in Settings → Import residents, or copy everything from another computer with Settings → Backups → Restore a backup.`;

run('gh', ['release', 'create', tag, '--repo', REPO, '--target', 'main', '--title', tag, '--notes', body, ...readdirSync(stage).map((f) => join(stage, f))]);
console.log(`\n✓ Published ${tag}: https://github.com/${REPO}/releases/tag/${tag}`);
