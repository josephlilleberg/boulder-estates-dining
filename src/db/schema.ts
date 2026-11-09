import type { Stmt } from './types';

// Schema v1. Everything hangs off `site` so Hill Street Place is just more rows.
// Rules the UI must never break are also enforced here, so a bug can't corrupt data:
//   - one resident per seat per meal, one seat per resident per meal (PK + UNIQUE)
//   - only residents who come to a meal can be seated at it (triggers)
// Foreign keys deliberately have no ON DELETE CASCADE: every delete is explicit,
// so the undo log sees it.

export const SCHEMA_VERSION = 3;

export const DDL: string[] = [
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,

  `CREATE TABLE site (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL)`,
  `CREATE TABLE site_meal (
    site_id TEXT NOT NULL REFERENCES site(id), meal TEXT NOT NULL, sort INTEGER NOT NULL,
    PRIMARY KEY (site_id, meal))`,
  // Which physical sections open at a meal, and what they're called then.
  `CREATE TABLE meal_section (
    site_id TEXT NOT NULL, meal TEXT NOT NULL, section INTEGER NOT NULL,
    label TEXT NOT NULL, sort INTEGER NOT NULL,
    PRIMARY KEY (site_id, meal, section),
    FOREIGN KEY (site_id, meal) REFERENCES site_meal(site_id, meal))`,

  `CREATE TABLE layout (
    id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id),
    name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE dining_table (
    id TEXT PRIMARY KEY, layout_id TEXT NOT NULL REFERENCES layout(id),
    section INTEGER NOT NULL, number INTEGER NOT NULL,
    shape TEXT NOT NULL CHECK (shape IN ('round', 'rect')),
    x REAL NOT NULL, y REAL NOT NULL, rotation INTEGER NOT NULL DEFAULT 0)`,

  // Catalogs, editable in Settings. Sheets read colours and labels from here.
  `CREATE TABLE beverage (
    site_id TEXT NOT NULL REFERENCES site(id), name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('coffee', 'tea', 'milk', 'juice', 'other')),
    short_label TEXT NOT NULL, color TEXT, text_color TEXT NOT NULL DEFAULT '#000000',
    default_drinkware TEXT NOT NULL, sort INTEGER NOT NULL,
    PRIMARY KEY (site_id, name))`,
  `CREATE TABLE drinkware (
    site_id TEXT NOT NULL REFERENCES site(id), name TEXT NOT NULL, sort INTEGER NOT NULL,
    PRIMARY KEY (site_id, name))`,

  `CREATE TABLE resident (
    id TEXT PRIMARY KEY, site_id TEXT NOT NULL REFERENCES site(id),
    first TEXT NOT NULL, last TEXT NOT NULL,
    chair TEXT NOT NULL DEFAULT 'arm' CHECK (chair IN ('arm', 'no_arm', 'none')),
    archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE resident_note (
    id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident(id),
    text TEXT NOT NULL, sort INTEGER NOT NULL)`,
  // A row means "comes to this meal".
  `CREATE TABLE attendance (
    resident_id TEXT NOT NULL REFERENCES resident(id), meal TEXT NOT NULL,
    PRIMARY KEY (resident_id, meal))`,
  // Kept when attendance is turned off, so turning it back on restores their drinks.
  `CREATE TABLE meal_pref (
    resident_id TEXT NOT NULL REFERENCES resident(id), meal TEXT NOT NULL,
    ro_water INTEGER NOT NULL DEFAULT 0, hot_water INTEGER NOT NULL DEFAULT 0,
    portion TEXT NOT NULL DEFAULT 'Full' CHECK (portion IN ('Full', 'Half')),
    PRIMARY KEY (resident_id, meal))`,
  `CREATE TABLE drink (
    id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident(id), meal TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('drink', 'coffee')), sort INTEGER NOT NULL,
    beverage TEXT NOT NULL, tea TEXT, drinkware TEXT NOT NULL,
    amount TEXT NOT NULL DEFAULT 'Full' CHECK (amount IN ('Full', 'Half')),
    extra_glass INTEGER NOT NULL DEFAULT 0, creamer INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE extra (
    id TEXT PRIMARY KEY, resident_id TEXT NOT NULL REFERENCES resident(id), meal TEXT NOT NULL,
    sort INTEGER NOT NULL, name TEXT NOT NULL, variant TEXT,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1))`,

  `CREATE TABLE seating (
    site_id TEXT NOT NULL REFERENCES site(id), meal TEXT NOT NULL,
    table_id TEXT NOT NULL REFERENCES dining_table(id), seat INTEGER NOT NULL CHECK (seat >= 0),
    resident_id TEXT NOT NULL REFERENCES resident(id),
    PRIMARY KEY (site_id, meal, table_id, seat),
    UNIQUE (site_id, meal, resident_id))`,
  `CREATE TRIGGER seating_requires_attendance BEFORE INSERT ON seating
    WHEN NOT EXISTS (SELECT 1 FROM attendance WHERE resident_id = NEW.resident_id AND meal = NEW.meal)
    BEGIN SELECT RAISE(ABORT, 'resident does not come to this meal'); END`,
  `CREATE TRIGGER attendance_off_requires_no_seat BEFORE DELETE ON attendance
    WHEN EXISTS (SELECT 1 FROM seating WHERE resident_id = OLD.resident_id AND meal = OLD.meal)
    BEGIN SELECT RAISE(ABORT, 'clear their seat before turning attendance off'); END`,

  `CREATE INDEX drink_by_resident ON drink (resident_id, meal, sort)`,
  `CREATE INDEX extra_by_resident ON extra (resident_id, meal, sort)`,
  `CREATE INDEX note_by_resident ON resident_note (resident_id, sort)`,
];

/**
 * Upgrades, keyed by the version they produce. A fresh database runs DDL (v1),
 * the seed, then every migration, so new installs and upgraded ones end up alike.
 */
export const MIGRATIONS: Record<number, string[]> = {
  // v2: the extras offered on the resident card become an editable list per site.
  // all_meals = 0 means Breakfast only (Dinner and Supper are napkins only);
  // variants is a '|' separated list ("Grape|Mixed Fruit"); counted = 0 hides "How many".
  2: [
    `CREATE TABLE extra_option (
      site_id TEXT NOT NULL REFERENCES site(id), name TEXT NOT NULL,
      variants TEXT NOT NULL DEFAULT '', all_meals INTEGER NOT NULL DEFAULT 0,
      counted INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL,
      PRIMARY KEY (site_id, name))`,
  ],
  // v3: an optional nickname, shown on the seating map and server sheets.
  3: [`ALTER TABLE resident ADD COLUMN nickname TEXT`],
};

/** Primary key columns per table; the undo log needs them to build inverse operations. */
export const PRIMARY_KEYS = {
  meta: ['key'],
  site: ['id'],
  site_meal: ['site_id', 'meal'],
  meal_section: ['site_id', 'meal', 'section'],
  layout: ['id'],
  dining_table: ['id'],
  beverage: ['site_id', 'name'],
  drinkware: ['site_id', 'name'],
  extra_option: ['site_id', 'name'],
  resident: ['id'],
  resident_note: ['id'],
  attendance: ['resident_id', 'meal'],
  meal_pref: ['resident_id', 'meal'],
  drink: ['id'],
  extra: ['id'],
  seating: ['site_id', 'meal', 'table_id', 'seat'],
} as const;

export type TableName = keyof typeof PRIMARY_KEYS;

export const ddlStmts = (): Stmt[] => DDL.map((sql) => ({ sql }));
