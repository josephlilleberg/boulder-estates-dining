# Boulder Estates Dining

A desktop app for running a senior-living dining room: who sits where, what each resident
drinks at each meal, and the printed sheets the kitchen and servers work from.

It replaces hand-maintained seating charts and drink lists with one place to make changes.
Every sheet updates on its own.

- **Windows** (x64) and **Mac** (Apple Silicon)
- Works offline. All data stays on the computer.
- Every change saves automatically and can be undone.
- Updates itself from GitHub releases.

---

## Contents

- [Download and install](#download-and-install)
- [First run](#first-run)
- [Using the app](#using-the-app)
- [Printed sheets](#printed-sheets)
- [Your data, backups and privacy](#your-data-backups-and-privacy)
- [Updates](#updates)
- [For developers](#for-developers)
  - [Tech stack](#tech-stack)
  - [Getting started](#getting-started)
  - [Scripts](#scripts)
  - [Project layout](#project-layout)
  - [How it works](#how-it-works)
  - [Testing](#testing)
  - [Building installers](#building-installers)
  - [Releasing a new version](#releasing-a-new-version)

---

## Download and install

Get the latest installer from the
[Releases page](https://github.com/josephlilleberg/boulder-estates-dining/releases/latest).

| Computer | File | Install |
| --- | --- | --- |
| Windows | `…_x64-setup.exe` | Double-click it and follow the steps. Installs for your user only, so no administrator password is needed. |
| Mac (M1 or later) | `…_aarch64.dmg` | Open it and drag **Boulder Estates Dining** onto **Applications**. |

The installers aren't code-signed, so the first launch shows a warning:

- **Windows:** "Windows protected your PC" → click **More info**, then **Run anyway**.
- **Mac:** the app is blocked the first time. Go to **System Settings → Privacy & Security**,
  scroll down, click **Open Anyway**, and confirm.

You only do this once per installed version.

## First run

The app ships with **no residents**. Resident data is never included in the app or this
repository. There are three ways to get residents in:

1. **Settings → Import residents → Choose file…** loads residents, their meals, drinks,
   extras and seats from your residents file (`.json`). This works once, in an empty app.
2. **Settings → Backups → Restore a backup** copies everything from another computer: take
   a backup file from that computer's backups folder and restore it here.
3. **Residents → + Add** enters residents by hand.

The rooms and tables for Boulder Estates' three sections come built in.

## Using the app

The top bar runs in shift order: **Seating · Residents · Sheets · Events**, then **Settings**
(the Room Designer opens from there), with the **meal** picker (Breakfast, Dinner, Supper)
beside them on Seating and Sheets. It fits on one line on a laptop; on narrower windows the
screen names shrink to icons (hover for the name).

**Shortcuts:** Ctrl+Z (⌘Z on Mac) undoes the last change, Ctrl+P opens Sheets with the print panel, and Ctrl+F
jumps to resident search. Big changes (deleting or archiving a resident, closing a section,
deleting a table) show a pop-up with an **Undo** button.

### Seating

A map of the dining room, one tab per open section. The map, the Room Designer and the
sheet previews scale to fit the window, so nothing needs scrolling.

- Click a **+** on an empty seat to seat someone. The picker lists who's not seated yet.
- Drag a name onto another seat to move them. Drop it on someone else to swap.
- Click a name to see **Seat details**: their drinks for this meal, chair and notes.
- A red **!** before a name means they have allergies or notes (shown in the app only, not on the server sheets).
- **Not seated** lists who's coming but has no seat. Drag a name onto a seat, or click it
  and then a seat.
- The header counts who's seated, who isn't, and the empty seats.

### Residents

The list (sortable by last or first name, searchable) and each resident's card. The card's own
meal tabs (each showing On or Off) pick the meal, so the top bar's meal picker isn't shown here.

- **Name:** first, last and an optional **nickname**. The nickname is what shows on the
  seating map and server sheets ("Bobby F."). Names typed in lowercase are capitalized,
  and the same first and last name can't be added twice (archived residents included).
- **Every meal:** chair (Arm chair, Armless chair, No chair) and allergies & notes.
- **Per meal:**
  - Whether they come.
  - Up to **2 drinks**, picked by type first (Milk, Juice, Coffee, Tea), then the drink.
    Coffee is the default for anyone new to a meal: at Breakfast it's a **Coffee** switch
    that doesn't count toward the 2, and at Dinner and Supper it's their first drink.
  - Extras (napkins, jelly, fruit…). An extra with kinds can have a backup for when the
    kitchen is out of the first choice: "Banana, else Apple" or "…, else any kind" (no
    backup means nothing).
  - **Special water** (None / RO / Hot water) and portion (Full / Half).
- **Drinks** have a cup, and creamer for coffee. Coffee and tea always go in a mug; milk goes in a
  glass, juice glass or to-go cup (at Breakfast, Skim and 2% Milk can also go in a milk pitcher);
  juice in a glass, juice glass or to-go cup.
  A full glass or full to-go cup of juice counts as **2 drinks** (a juice glass or a half
  counts as 1), and adding the same juice again makes one full glass. **Extra glass** (one for water) is offered beside a drink in a glass,
  or beside two of the same juice poured into one glass. Only a glass or a to-go cup comes in
  Full or Half. Two halves of the
  same drink are **poured together**: two juice glasses become one glass, and two half to-go
  cups become one. The card says so, and the sheets follow.
- The **⋯** menu offers rename, **Archive** (hides them everywhere but keeps their details,
  and can be restored) and **Delete** (removes them; Undo brings them back).

### Sheets

- Every sheet for the meal, one tab each (Setup, Server 1 2 3). Two zooms: **Drawing** (the
  default) crops to the tables and labels and fits them to the window, with the key beside the
  setup sheet; **Whole page** shows the sheet exactly as
  it prints.
- **Print…** opens a panel to tick the sheets you want (all to start) and print them, or save
  as PDF from the print dialog. The setup sheet prints on 11×17 and the others on Letter, so the
  app opens one print dialog per paper size.

### Events

Thanksgiving, Christmas and the like, each with its own guest list and seating. The guest list
starts with everyone who usually comes to that meal. **Cancelled** (left) and **Additions**
(right) each have a search: type a name and click Cancel or Add, or press Enter when only one
name matches. Additions also takes guests (+ Guest beside someone coming).

### Room Designer

The room layout used by every screen and sheet. Open it from **Settings → Room layout**;
**← Settings** goes back.

- Add tables (round seats 4, rectangle seats 6), and duplicate, move, rotate or delete them.
- **Even out spacing** tidies rows.
- Deleting a table frees its seats at every meal, in one undoable step.

### Settings

- **Drinks, cups & extras:**
  - Add or rename drinks, set the short name printed on server sheets, and pick pill colours.
  - Add cups.
  - Edit the "Add an extra" list, and reorder it with the up/down arrows (setup sheets list extras in this order).
  - Renaming a drink updates every resident who has it. Anything still in use can't be removed.
- **Meals & sections:** which tables each meal uses, in plain words ("Sections 1, 2 and 3",
  "Section 2's tables, named 'Section 1'"). Open or close each section's tables per meal, and rename them.
  Closing a section sends its seated residents back to waiting, as one undoable step.
- **Room layout:** opens the Room Designer.
- **Backups:** change the folder, or restore a backup. If the folder can't be written (on a Mac, the app may need permission for Documents again after an update), the app still opens, saves the day's backup in its own folder instead, and says so here with how to allow access.

### Undo

**Undo** (top right) steps back through every change made since the app was opened. The
label shows what it will undo. The history is cleared when the app closes or after a restore.

## Printed sheets

| Sheet | Paper | For | Shows |
| --- | --- | --- | --- |
| **Setup** | 11×17 | Setting the tables | Every section on one page. At each seat, what's added to the usual setting (a glass and a coffee mug): **+Glass**, **+Juice**, **+To-Go**, **+Pitcher** (milk pitcher or hot water), one above the other with the drinkware nearest the table on every side, then the resident's **extras** in one yellow box outside them, one per line, always in the order of the Extras list in Settings (reorder it there with the up/down arrows; it starts Napkins, Soup Spoon, Butter, Jelly, Brown Sugar, Fruit), at full size; an extra with kinds shows its name and count with the kind bulleted underneath (Jelly ×2 / • Grape, then a named backup like “else Strawberry”; “any kind” isn't printed), fruit is just its kind (Banana), a bowl reads by its kind on one line (Cereal Bowl), and a line too long for the box carries on, indented (a count like ×2 stays with its word); the lines share a left edge and sit centred in the box. Every chip and box on a sheet is the same width (as wide as the sheet's longest line needs, 72–110 px) and the same type size, so each seat's stack lines up. The usual glass holds the first drink in a glass, or else RO water / the water glass. A seat with no coffee or tea gets a red dot on the table: take the mug away. On the table edge at each seat (bent along the edge on a round table), one length for every chair: a thin dark grey bar for an arm chair, light grey **Armless** (dark outline) for an armless chair, red **No chair** (take the chair away). The two word marks have softly rounded corners rather than round ends, so the words get the mark's whole length. Red is the only colour on the edge, and the words mean there's nothing to learn. Tables where anyone takes creamer are tinted. The key under the drawing reads as short instructions in three groups: **Chairs** (Arm chair, Armless chair, Remove chair), **Table** (Remove mug, Add creamer tray) and **Place setting** (+Glass: Add drinkware, +Extra: Add extras), every sample pill one size. Chips that crowd each other slide apart, judged by their shapes as drawn (so a table set at an angle keeps each seat's chips by its seat), and never back onto the chair marks. Tables slide apart sideways so neighbouring chips keep a clear gap; each section gets the width it needs. When the page has room to spare, everything (tables, chips and chair marks) is drawn up to 1.6× larger to fill it. A very full sheet is drawn smaller, with its rows spread down the page's whole height; tables always stay lined up in their rows (crowded neighbours only ever slide sideways). At **Breakfast** (one section) the setup sheet follows its server sheet's layout: the same tables in the same arrangement, spread across the full width of the 11 × 17 page. |
| **Server** | Letter, one per section | Pouring drinks | Every seat keeps room for a name and two drinks, whether anyone sits there or not, so a sheet's proportions and size come from the room alone and never change with who's seated or what they drink: the test app's stress tests show every table exactly where it always is (a table by the wall sits far enough in for them). At Breakfast, where the server and setup sheets share a layout, each seat also keeps room for two drink chips (+Glass, +Juice) and its chips are always a seat wide, so drinks never move anything there either. Tables in different rows only ever move apart up and down, so a table stays in the column of the one above it (Section 3's Table 4 stays under Table 2, even beside the angled Table 7, at the cost of that sheet being drawn a little smaller); tables in the same row slide apart sideways. The drawing has the whole page under the header; a section whose room has space to spare is drawn up to 1.6× larger (tables, names and drinks alike), and the tables keep their arrangement. Each resident's name with a pill for everything the server fills, all one width and always in the same order from the name: milk, juice, tea, other drinks (short names from Settings: Orange, Apple, Cranberry…), RO water is a small aqua **RO** pill (bent along the edge on a round table) on the table under the resident's name (it's rare, so the labels keep room for just two drinks). Hot water isn't on the server sheet: it comes in a pitcher, which the setup sheet adds. A dark band under each pill names what it goes in (GLASS, JUICE GLASS, TO-GO, PITCHER); tea's band says which tea instead (CHAMOMILE, BLACK, GREEN), since a mug isn't filled by the server. Half a glass or cup shows in the band: **½ GLASS**. Two of the same juice are poured together: one pill (Cranberry) with the cup it goes in (GLASS). Tables spread apart by what's actually at each seat, keeping a clear gap; a section too full for that is drawn smaller, every label by the same amount. |
| **Setup & drinks** | 11×17, Supper only | Setting and pouring | Supper's one page, in place of its setup and server sheets. At each seat, from the table outward: the name, the drink pills (as on the server sheet), then the extras chips. A cup added to the usual setting (one glass, one mug) has a green **+** at the left of its band, in place of +Glass / +Juice chips; an extra glass for water is a **Water** pill. A red dot on the table means no mug. Chair pills on the table edge, the creamer tint, the key and the notes are all on it. |

Each page's top right shows when anything on the sheets last changed (“Updated Nov 22, 2026”): any change to seating, residents or settings, or importing or restoring data; holiday events don't count, and Undo puts the old date back. There's no footer, so the drawing gets that room.

## Your data, backups and privacy

| | Mac | Windows |
| --- | --- | --- |
| Database | `~/Library/Application Support/com.boulderestates.dining/dining.sqlite3` | `%APPDATA%\com.boulderestates.dining\dining.sqlite3` |
| Daily backups | `~/Documents/Boulder Estates Backups` | `Documents\Boulder Estates Backups` |

- A backup is saved **every day** and kept for **30 days**. Another is saved before the app
  upgrades its database.
- **Restore a backup** checks the file first: it must be a sound dining-app database, and
  not from a newer version. It also saves the current data as "Before a restore", so a
  restore can itself be undone.
- Each computer keeps its own data. Nothing syncs, and nothing is sent anywhere. The app
  only goes online to check GitHub for updates.
- Installing, updating or uninstalling the app leaves the data and backups in place.
  The Windows uninstaller asks before it deletes app data, and it never touches the
  backups folder.

## Updates

The app looks for a newer version when it opens and every 4 hours while it's open. When
one is published, the top bar shows **Update to x.y.z**, and the menu item changes to match.
Clicking it downloads the update, installs it and restarts the app. Your data is kept.

You can also check at any time:

- **Mac:** Boulder Estates Dining menu → **Check for Updates…** (**About** shows the version)
- **Windows:** **File → Check for Updates…** (**About** is there too)

Updates are cryptographically signed. The app only installs updates signed with this
project's key. Versions before 0.1.2 can't update themselves, so install 0.1.2 or later by
hand once.

---

## For developers

### Tech stack

| Layer | Choice |
| --- | --- |
| Desktop shell | [Tauri 2](https://tauri.app) (Rust) |
| UI | React 18 + TypeScript (strict), Vite |
| Database | SQLite through our own `rusqlite` commands (see [Why not tauri-plugin-sql](#why-not-tauri-plugin-sql)) |
| Browser dev / tests | [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly) |
| Tests | Vitest (TypeScript), `cargo test` (Rust) |
| Installers | NSIS (Windows), `.app` + `.dmg` (Mac) |
| Updates | `tauri-plugin-updater`, served from GitHub Releases |

### Getting started

Requirements: **Node.js 20+** and **Rust** (via [rustup](https://rustup.rs)).

```bash
git clone https://github.com/josephlilleberg/boulder-estates-dining.git
cd boulder-estates-dining
npm ci
```

Run it in a browser (fast UI work; the data lives in the browser's localStorage):

```bash
npm run dev
```

Run it as the real desktop app:

```bash
npm run app:dev
```

To work with realistic data in the browser, import `src/test/fixture-residents.json` (85
made-up residents) in Settings → Import residents.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server in the browser (sql.js database in localStorage) |
| `npm run app:dev` | Desktop app in development mode |
| `npm run test-app` | The **test app**: the desktop app run from the source, updating live as the code changes. Its own data and backups (`com.boulderestates.dining.test`), never the real app's; no updates; marked TEST APP, with a **Stress test** switch that puts a worst-case resident at every seat on the sheets |
| `npm run test-app:copy` | Copy the real app's data into the test app (read-only on the real data; close the test app first) |
| `npm test` | All TypeScript tests (Vitest) |
| `npm run test:rust` | Rust tests (database commands, backup and restore) |
| `npm run typecheck` | `tsc` with strict settings |
| `npm run build` | Type-check and build the web bundle into `dist/` |
| `npm run build:mac` | Apple Silicon `.app` and `.dmg` |
| `npm run build:win` | Windows `setup.exe`, cross-compiled on the Mac |
| `npm run release -- "notes"` | Test, build both installers, and publish a GitHub release with update files |

### Project layout

```
src/
  db/            SQLite access: schema + migrations, the Tauri and sql.js drivers,
                 repo (rows → domain objects), resident import
  domain/        Pure model and rules: types, sites/meals, room geometry, labels, palette
  state/         Store (load, save, undo), actions per area, backups, updates
  screens/       One folder per screen: seating, residents, designer, view, print, settings
  sheets/        Sheet geometry and rendering shared by View, Print preview and paper
  shell/         Top bar, meal strip, native menu bar
  ui/            Small shared components (dialogs, switches)
  styles/        Design tokens and screen styles
  test/          Test fixture (made-up residents) and seeding helper
src-tauri/
  src/db.rs      SQLite commands: select, batch (one transaction), backup, list, restore
  src/lib.rs     App setup and plugins
  tauri.conf.json, capabilities/, icons/
scripts/
  release.mjs    Build + sign + publish a release
docs/
  INSTALLERS.md  Build, install and release details
```

### How it works

**One way to change data.** Every edit is an action, `(data) => Op[]`, built from three
operations: `put`, `patch` and `del`. `Store.change(label, action)` does the rest:

1. Computes the inverse of each op from the rows as they are just before it.
2. Runs all the ops in **one SQLite transaction**.
3. Reloads the data, and pushes the inverse onto the undo stack.

That gives generic, exact undo for every feature. A change either saves completely or not
at all.

**Pure rules, thin screens.** Sheet layout (label placement, spacing, rows), setup-sheet
rules, drink pills and seating geometry are plain functions in `src/sheets` and
`src/domain`. They're unit-tested without a browser, and View, the Print preview and the
printed page all render from the same output.

**Schema migrations.** `src/db/schema.ts` holds the DDL and a numbered `MIGRATIONS` record.
On startup the app backs up first, then upgrades older databases, including restored
backups, in one transaction. It refuses databases from a newer version.

**No resident data in code.** A new database contains the catalog (drinks, cups, extras),
rooms and tables, and nothing else. Residents arrive through `importResidents`, which
validates the file and only runs on an empty database. Tests use made-up residents.

#### Why not tauri-plugin-sql

The plugin's connection pool can split `BEGIN` and `COMMIT` across connections, which
breaks the one-transaction-per-change guarantee. `src-tauri/src/db.rs` keeps one
connection behind a mutex and exposes a `db_batch` command that runs a list of statements
atomically.

### Testing

```bash
npm test
```

```bash
npm run test:rust
```

The TypeScript suite covers:

- Every resident edit: it survives a restart and undoes exactly.
- Settings actions.
- Seating and table geometry.
- Setup-sheet rules.
- **Server-sheet spacing:** a stress test puts two drinks at every seat and checks for
  zero label overlaps and nothing off the page, for every meal and section.
- Migrations.
- Resident import and validation.

The Rust tests cover:

- Atomic batches (all or nothing).
- Daily backups, and pruning that only touches the app's own files.
- Restore, including the safety copy and refusing foreign or newer databases.

### Building installers

Both installers build on the Mac. One-time setup for the Windows cross-compile:

```bash
brew install nsis llvm lld
```

```bash
rustup target add x86_64-pc-windows-msvc
```

```bash
cargo install --locked cargo-xwin
```

Then run `npm run build:mac` or `npm run build:win`. Both scripts read the updater signing
key from `~/.tauri/boulder-estates-dining.key`. See [docs/INSTALLERS.md](docs/INSTALLERS.md)
for building on a Windows PC instead, and for known quirks: NSIS needs a UTF-8 locale, and
the `LNK4099` linker warnings are harmless.

### Releasing a new version

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`.
2. Commit and push.
3. Publish:

   ```bash
   npm run release -- "What changed, in a sentence or two"
   ```

The script refuses to run if:

- the tree isn't clean or isn't pushed,
- the versions don't match,
- the tag already exists, or
- any resident name from the local private data file shows up in the built bundle.

Otherwise it runs the tests, builds both installers, signs the update bundles, writes
`latest.json` and publishes the GitHub release. Installed apps then offer the update.

> **Keep a backup of `~/.tauri/boulder-estates-dining.key`.** Installed apps only accept
> updates signed with it. If it's lost, every computer has to install the next version by
> hand.

### Privacy rules for contributors

- Never commit resident data. `src/db/seed/legacy-be.json`, the design mockup and the
  original brief are git-ignored for that reason.
- Use `src/test/fixture-residents.json` (made-up names) for tests and demos.
- The release script checks the built bundle for real names whenever the private data file
  is present locally.
