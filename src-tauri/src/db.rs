//! Thin SQLite bridge. The schema and all queries live in TypeScript (src/db);
//! Rust only owns the connection so that a batch of statements is one real
//! transaction, and so backups use SQLite itself rather than a file copy.

use rusqlite::{Connection, types::ValueRef};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct DbState {
    pub conn: Mutex<Connection>,
    pub path: PathBuf,
}

#[derive(Deserialize)]
pub struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

#[derive(Serialize)]
pub struct BackupResult {
    path: String,
    created: bool,
    removed: Vec<String>,
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(conn)
}

fn to_sql(v: &Value) -> Result<rusqlite::types::Value, String> {
    use rusqlite::types::Value as V;
    Ok(match v {
        Value::Null => V::Null,
        Value::Bool(b) => V::Integer(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => V::Integer(i),
            None => V::Real(n.as_f64().ok_or("bad number")?),
        },
        Value::String(s) => V::Text(s.clone()),
        other => return Err(format!("unsupported SQL parameter: {other}")),
    })
}

fn params_of(params: &[Value]) -> Result<Vec<rusqlite::types::Value>, String> {
    params.iter().map(to_sql).collect()
}

fn from_sql(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Value::Null, // no blobs in this schema
    }
}

pub fn select(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = stmt.column_names().map(|s| s.to_string()).collect();
    let p = params_of(params)?;
    let mut rows = stmt.query(rusqlite::params_from_iter(p)).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut m = Map::new();
        for (i, name) in names.iter().enumerate() {
            m.insert(name.clone(), from_sql(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(m);
    }
    Ok(out)
}

/// All statements commit together or not at all.
pub fn batch(conn: &mut Connection, stmts: &[Stmt]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in stmts {
        let p = params_of(&s.params)?;
        tx.execute(&s.sql, rusqlite::params_from_iter(p))
            .map_err(|e| format!("{e} — in: {}", s.sql))?;
    }
    tx.commit().map_err(|e| e.to_string())
}

fn is_backup_name(name: &str) -> bool {
    // dining-YYYY-MM-DD.sqlite3
    let Some(date) = name.strip_prefix("dining-").and_then(|r| r.strip_suffix(".sqlite3")) else {
        return false;
    };
    date.len() == 10
        && date.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() })
}

/// Writes today's backup if it doesn't exist yet, then keeps only the newest `keep`.
/// `today` comes from the UI so "today" means the manager's local date.
pub fn backup(conn: &Connection, dir: &Path, today: &str, keep: usize) -> Result<BackupResult, String> {
    let name = format!("dining-{today}.sqlite3");
    if !is_backup_name(&name) {
        return Err(format!("bad backup date: {today}"));
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join(&name);
    let created = !path.exists();
    if created {
        // VACUUM INTO writes a consistent, compacted snapshot even with WAL on.
        conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])
            .map_err(|e| e.to_string())?;
    }

    // Only ever touch files we named; anything else in the folder is left alone.
    let mut ours: Vec<String> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| is_backup_name(n))
        .collect();
    ours.sort(); // ISO dates sort chronologically
    let excess = ours.len().saturating_sub(keep.max(1));
    let mut removed = Vec::new();
    for n in ours.into_iter().take(excess) {
        std::fs::remove_file(dir.join(&n)).map_err(|e| e.to_string())?;
        removed.push(n);
    }
    Ok(BackupResult { path: path.to_string_lossy().into_owned(), created, removed })
}

// ---- Restore -----------------------------------------------------------------

#[derive(Serialize)]
pub struct BackupFile {
    name: String,
    path: String,
    bytes: u64,
}

/// Restorable files in the backup folder, newest first: the daily backups plus
/// the safety copies made before each restore.
pub fn list_backups(dir: &Path) -> Result<Vec<BackupFile>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<BackupFile> = std::fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| {
            let e = e.ok()?;
            let name = e.file_name().into_string().ok()?;
            if !(is_backup_name(&name) || is_safety_name(&name)) {
                return None;
            }
            let bytes = e.metadata().ok()?.len();
            Some(BackupFile { path: e.path().to_string_lossy().into_owned(), name, bytes })
        })
        .collect();
    // Daily names sort by date; safety copies carry a date-time stamp, so sort on that part.
    out.sort_by(|a, b| stamp_of(&b.name).cmp(stamp_of(&a.name)));
    Ok(out)
}

fn stamp_of(name: &str) -> &str {
    name.trim_start_matches("dining-").trim_start_matches("before-restore-").trim_end_matches(".sqlite3")
}

fn is_safety_name(name: &str) -> bool {
    // before-restore-YYYY-MM-DD-HHMMSS.sqlite3: never pruned by the daily backup.
    let Some(s) = name.strip_prefix("before-restore-").and_then(|r| r.strip_suffix(".sqlite3")) else {
        return false;
    };
    s.len() == 17 && s.chars().all(|c| c.is_ascii_digit() || c == '-')
}

/// Replaces the open database with a backup. The backup is checked first (it must
/// be one of ours, intact, and not from a newer app), and the current data is saved
/// as before-restore-<stamp>.sqlite3 in `dir`, so a restore can itself be undone.
pub fn restore(conn: &mut Connection, file: &Path, dir: &Path, stamp: &str, max_version: i64) -> Result<String, String> {
    let safety = format!("before-restore-{stamp}.sqlite3");
    if !is_safety_name(&safety) {
        return Err(format!("bad stamp: {stamp}"));
    }
    {
        let src = Connection::open_with_flags(file, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|e| e.to_string())?;
        let ok: String = src.query_row("PRAGMA quick_check", [], |r| r.get(0)).map_err(|_| "That file isn’t a dining app backup.".to_string())?;
        if ok != "ok" {
            return Err("That backup is damaged and can’t be restored.".into());
        }
        let v: i64 = src
            .query_row("SELECT CAST(value AS INTEGER) FROM meta WHERE key = 'schema_version'", [], |r| r.get(0))
            .map_err(|_| "That file isn’t a dining app backup.".to_string())?;
        if v < 1 || v > max_version {
            return Err("That backup is from a newer version of the app.".into());
        }
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let safety_path = dir.join(&safety);
    conn.execute("VACUUM INTO ?1", [safety_path.to_string_lossy().as_ref()]).map_err(|e| e.to_string())?;
    conn.restore(rusqlite::MAIN_DB, file, None::<fn(rusqlite::backup::Progress)>)
        .map_err(|e| e.to_string())?;
    Ok(safety_path.to_string_lossy().into_owned())
}

// ---- Tauri commands --------------------------------------------------------

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub async fn db_select(state: tauri::State<'_, DbState>, sql: String, params: Vec<Value>) -> CmdResult<Vec<Map<String, Value>>> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    select(&conn, &sql, &params)
}

#[tauri::command]
pub async fn db_batch(state: tauri::State<'_, DbState>, stmts: Vec<Stmt>) -> CmdResult<()> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    batch(&mut conn, &stmts)
}

#[tauri::command]
pub async fn db_backup(state: tauri::State<'_, DbState>, dir: String, today: String, keep: usize) -> CmdResult<BackupResult> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    backup(&conn, Path::new(&dir), &today, keep)
}

#[tauri::command]
pub async fn db_list_backups(dir: String) -> CmdResult<Vec<BackupFile>> {
    list_backups(Path::new(&dir))
}

#[tauri::command]
pub async fn db_restore(state: tauri::State<'_, DbState>, file: String, dir: String, stamp: String, max_version: i64) -> CmdResult<String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    restore(&mut conn, Path::new(&file), Path::new(&dir), &stamp, max_version)
}

#[tauri::command]
pub fn db_info(app: tauri::AppHandle, state: tauri::State<'_, DbState>) -> CmdResult<Map<String, Value>> {
    use tauri::Manager;
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let mut m = Map::new();
    m.insert("dbPath".into(), Value::String(state.path.to_string_lossy().into_owned()));
    m.insert(
        "defaultBackupDir".into(),
        Value::String(docs.join("Boulder Estates Backups").to_string_lossy().into_owned()),
    );
    Ok(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE t (a INTEGER, b TEXT);").unwrap();
        c
    }

    #[test]
    fn batch_is_atomic() {
        let mut c = mem();
        let stmts = vec![
            Stmt { sql: "INSERT INTO t VALUES (?1, ?2)".into(), params: vec![1.into(), "x".into()] },
            Stmt { sql: "INSERT INTO nope VALUES (1)".into(), params: vec![] },
        ];
        assert!(batch(&mut c, &stmts).is_err());
        assert!(select(&c, "SELECT * FROM t", &[]).unwrap().is_empty());
    }

    #[test]
    fn backup_writes_once_and_prunes_only_our_files() {
        let tmp = tempfile::tempdir().unwrap();
        let c = mem();
        std::fs::write(tmp.path().join("notes.txt"), "keep me").unwrap();
        for d in ["2026-01-01", "2026-01-02", "2026-01-03"] {
            backup(&c, tmp.path(), d, 2).unwrap();
        }
        let again = backup(&c, tmp.path(), "2026-01-03", 2).unwrap();
        assert!(!again.created);
        let mut names: Vec<_> = std::fs::read_dir(tmp.path()).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        names.sort();
        assert_eq!(names, ["dining-2026-01-02.sqlite3", "dining-2026-01-03.sqlite3", "notes.txt"]);
    }

    fn app_db(path: &Path, version: &str, value: &str) {
        let c = Connection::open(path).unwrap();
        c.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE t (a TEXT);").unwrap();
        c.execute("INSERT INTO meta VALUES ('schema_version', ?1)", [version]).unwrap();
        c.execute("INSERT INTO t VALUES (?1)", [value]).unwrap();
    }

    #[test]
    fn restore_replaces_data_and_keeps_a_safety_copy() {
        let tmp = tempfile::tempdir().unwrap();
        let live = tmp.path().join("live.sqlite3");
        let old = tmp.path().join("dining-2026-01-01.sqlite3");
        app_db(&live, "2", "now");
        app_db(&old, "1", "then");
        let mut c = open(&live).unwrap();
        let safety = restore(&mut c, &old, tmp.path(), "2026-01-02-093000", 2).unwrap();
        let v: String = c.query_row("SELECT a FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "then");
        let s = Connection::open(&safety).unwrap();
        let v: String = s.query_row("SELECT a FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "now");
        let names: Vec<_> = list_backups(tmp.path()).unwrap().into_iter().map(|b| b.name).collect();
        assert_eq!(names, ["before-restore-2026-01-02-093000.sqlite3", "dining-2026-01-01.sqlite3"]);
    }

    #[test]
    fn restore_refuses_foreign_or_newer_files() {
        let tmp = tempfile::tempdir().unwrap();
        let live = tmp.path().join("live.sqlite3");
        app_db(&live, "2", "now");
        let newer = tmp.path().join("newer.sqlite3");
        app_db(&newer, "9", "x");
        let junk = tmp.path().join("junk.sqlite3");
        std::fs::write(&junk, "not a database").unwrap();
        let mut c = open(&live).unwrap();
        assert!(restore(&mut c, &newer, tmp.path(), "2026-01-02-093000", 2).is_err());
        assert!(restore(&mut c, &junk, tmp.path(), "2026-01-02-093000", 2).is_err());
        let v: String = c.query_row("SELECT a FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(v, "now");
    }

    #[test]
    fn rejects_bad_dates() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(backup(&mem(), tmp.path(), "../evil", 30).is_err());
    }
}
