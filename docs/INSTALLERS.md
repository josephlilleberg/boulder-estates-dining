# Installers

| Platform | Build (on the Mac) | Output |
| --- | --- | --- |
| Windows x64 | `npm run build:win` | `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/…_x64-setup.exe` |
| Mac (Apple Silicon only) | `npm run build:mac` | `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/…_aarch64.dmg` |

The app ships with no residents. On first run, load them with Settings → Import residents
(your residents .json file; works once, in an empty app). Each computer keeps its own data;
nothing syncs. To move data across, copy a backup file
over and use Settings → Backups → Restore a backup (same format on both).

## Releasing an update

Installed apps check GitHub for a newer version at launch and show **Update to x.y.z** in
the top bar. You can also check any time from the menu: **Boulder Estates Dining → Check for
Updates…** on the Mac, **File → Check for Updates…** on Windows (About shows the version).
Updating downloads, installs and restarts; data and backups are kept.

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
2. Commit and push.
3. Run:

   ```bash
   npm run release -- "What changed, in a sentence or two"
   ```

   It runs the tests, builds both installers, signs the update files, checks that no resident
   names got bundled, and publishes the GitHub release with `latest.json`.

Updates are signed with the key at `~/.tauri/boulder-estates-dining.key` (public half in
`tauri.conf.json`). **Keep a backup of that key file.** Installed apps only accept updates
signed with it; if it's lost, every computer has to install the next version by hand.

# Windows

The app ships as one file, `Boulder Estates Dining_<version>_x64-setup.exe` (NSIS).
It installs for the current Windows user only, so it needs no administrator password.

## Building the installer

Pick one. Both produce the same `setup.exe` under
`src-tauri/target/<target>/release/bundle/nsis/`.

### A. On a Windows PC (simplest, officially supported)

1. Install [Node.js LTS](https://nodejs.org) and [Rust](https://rustup.rs). The Rust installer
   offers to install the Visual Studio C++ Build Tools; accept that (it's Microsoft's licence).
2. Copy this project folder over (without `node_modules` and `src-tauri/target`).
3. In the project folder:

   ```bash
   npm ci
   npm test
   npx tauri build
   ```

### B. Cross-compile on the Mac (Tauri marks this experimental)

One-time setup. `cargo xwin` downloads the Microsoft C runtime and Windows SDK and accepts
Microsoft's licence for them:

```bash
brew install nsis llvm lld
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
```

Then, each time:

```bash
npm run build:win
```

That script puts Homebrew's LLVM and LLD on `PATH` and sets `LANG=en_US.UTF-8`. NSIS 3.13
crashes with `std::bad_alloc` when the shell has no locale set, even on a trivial script.
The linker's `LNK4099` warnings about missing Microsoft `.pdb` files are harmless.

## Installing it

1. Double-click the `setup.exe`.
2. Windows may say “Windows protected your PC” because the installer isn't code-signed.
   Click **More info**, then **Run anyway**.
3. Click through the installer. The app appears in the Start menu as **Boulder Estates Dining**.

Her data lives in `%APPDATA%\com.boulderestates.dining\dining.sqlite3`, and a backup is
saved every day to `Documents\Boulder Estates Backups` (Settings → Backups can change the
folder or restore a backup). Uninstalling keeps both, unless “Delete the application data”
is ticked in the uninstaller (it starts unticked); the backups folder is never touched.

## Updating

Click **Update** in the app, or run a newer `setup.exe` over the old one. Data and backups are kept; the app upgrades the
database on first launch.

## Code signing

Not used: this is a personal-use app, so the SmartScreen warning above (once per new
version) is accepted. If it ever spreads beyond that, or a work PC blocks unsigned
software, Azure Trusted Signing via `bundle > windows > signCommand` removes the warning.

# Mac (Apple Silicon)

```bash
npm run build:mac
```

Builds `Boulder Estates Dining.app` and a `.dmg` for Apple Silicon (M1 and later). Intel
Macs aren't supported (by choice; `--target universal-apple-darwin` would add them).

## Installing it

1. Open the `.dmg` and drag **Boulder Estates Dining** onto **Applications**.
2. The first time it's opened, macOS blocks it because it isn't notarized. Go to
   **System Settings → Privacy & Security**, scroll down, click **Open Anyway**, and confirm.
   This is needed once per new version, and only for a copy that was downloaded or
   AirDropped (a copy built on the same Mac opens directly).

Data lives in `~/Library/Application Support/com.boulderestates.dining/dining.sqlite3`;
daily backups go to `~/Documents/Boulder Estates Backups`.

## Updating

Click **Update** in the app, or drag the newer app over the old one in Applications. Data and backups are kept.

## Signing

The app is ad-hoc signed only. Removing the Gatekeeper prompt needs an Apple Developer
account ($99/year) and notarization; not worth it for personal use.
