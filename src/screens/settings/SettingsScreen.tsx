import { useEffect, useRef, useState } from 'react';
import { importResidents, parseResidentsFile } from '../../db/importResidents';
import { isTauri } from '../../db/tauriDb';
import type { Beverage, ExtraOption } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { act } from '../../state/act';
import { BACKUP_KEEP, localDate, runDailyBackup } from '../../state/backup';
import { SCHEMA_VERSION } from '../../db/schema';
import { setBackupDir } from '../../state/settingsActions';
import { getStore, useStore } from '../../state/store';
import type { ScreenProps } from '../types';
import { CupDialog, DrinkDialog, ExtraOptionDialog, MealSectionsDialog, RestoreDialog } from './dialogs';

const FALLBACK_DIR = 'Documents\\Boulder Estates Backups';

const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', minHeight: 30, padding: '0 10px', borderRadius: 6, background: '#F3F4F6', border: '1px solid #D1D5DB', fontSize: 13, color: '#111827', cursor: 'pointer', fontFamily: 'inherit' };
const subhead: React.CSSProperties = { margin: '16px 0 8px', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#6B7280' };

/** "One section: the Section 2 tables, called “Section 1”" / "Sections 1, 2, 3", worded like the mockup. */
export function sectionsSummary(sections: { section: number; label: string }[]): string {
  const plain = (s: { section: number; label: string }) => s.label === `Section ${s.section}`;
  if (sections.length === 1) {
    const s = sections[0]!;
    return plain(s) ? `One section: Section ${s.section}` : `One section: the Section ${s.section} tables, called “${s.label}”`;
  }
  if (sections.every(plain)) return `Sections ${sections.map((s) => s.section).join(', ')}`;
  return sections.map((s) => (plain(s) ? `Section ${s.section}` : `Section ${s.section} tables as “${s.label}”`)).join(' · ');
}

type Open = { kind: 'drink'; drink: Beverage | null } | { kind: 'cup'; cup: string | null } | { kind: 'extra'; option: ExtraOption | null } | { kind: 'meal'; meal: MealName } | { kind: 'restore'; dir: string } | null;

export function SettingsScreen({ site }: ScreenProps) {
  const data = useStore((s) => s.data);
  const live: Site = data.sites.find((s) => s.id === site.id) ?? site;
  const [open, setOpen] = useState<Open>(null);
  const [defaultDir, setDefaultDir] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const desktop = isTauri();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const noResidents = !data.residents.some((r) => r.siteId === site.id);

  useEffect(() => {
    void getStore()
      .database.info()
      .then((i) => setDefaultDir(i?.defaultBackupDir ?? null));
  }, []);

  const bevs = data.beverages.filter((b) => b.siteId === site.id);
  const cups = data.drinkware.filter((w) => w.siteId === site.id);
  const extras = data.extraOptions.filter((x) => x.siteId === site.id);
  const dir = data.settings.backup_dir ?? defaultDir;

  const changeFolder = async () => {
    const { open: pickFolder } = await import('@tauri-apps/plugin-dialog');
    const picked = await pickFolder({ directory: true, title: 'Choose a folder for backups', defaultPath: dir ?? undefined });
    if (typeof picked !== 'string' || picked === dir) return;
    if (!(await act('Change backup folder', setBackupDir(picked)))) return;
    // Back up there now, so a folder that can't be written to shows up straight away.
    try {
      await runDailyBackup(getStore().database, { ...data.settings, backup_dir: picked });
      setNote('Saved a backup in the new folder.');
    } catch (e) {
      setNote(`Couldn’t save a backup there: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Resident data isn't part of the app; it's loaded once from the user's own file.
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseResidentsFile(await file.text());
      let n = 0;
      await getStore().replaceAll(async (db) => {
        n = await importResidents(db, parsed);
      });
      setImportNote(`Imported ${n} residents with their meals, drinks and seats.`);
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async (file: { path: string }) => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${localDate(d)}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    await getStore().replaceAll((db) => db.restore(file.path, dir!, stamp, SCHEMA_VERSION).then(() => undefined));
    setNote('Backup restored. Today’s data before the restore is in the backup list.');
  };

  return (
    <div>
      <h1 className="h1" style={{ marginBottom: 16 }}>Settings</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section className="card" style={{ padding: 18 }}>
          <h2 className="h2" style={{ marginBottom: 6 }}>Drinks, cups &amp; extras</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4B5563' }}>{site.name}. Changes show on the resident card and every sheet. Click one to change it.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {bevs.map((b) => (
              <button key={b.name} type="button" style={chip} onClick={() => setOpen({ kind: 'drink', drink: b })}>
                {b.kind !== 'coffee' && b.shortLabel !== b.name ? `${b.name} (${b.shortLabel})` : b.name}
              </button>
            ))}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#4B5563' }}>In brackets: the short name printed on server sheets.</p>
          <button type="button" className="btn sm" onClick={() => setOpen({ kind: 'drink', drink: null })}>
            + Add a drink
          </button>

          <h3 style={subhead}>Cups</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {cups.map((c) => (
              <button key={c.name} type="button" style={chip} onClick={() => setOpen({ kind: 'cup', cup: c.name })}>
                {c.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn sm" onClick={() => setOpen({ kind: 'cup', cup: null })}>
            + Add a cup
          </button>

          <h3 style={subhead}>Extras</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {extras.map((x) => (
              <button key={x.name} type="button" style={chip} onClick={() => setOpen({ kind: 'extra', option: x })}>
                {x.name}
                {x.allMeals ? ' · every meal' : ''}
              </button>
            ))}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#4B5563' }}>Breakfast only unless marked “every meal”.</p>
          <button type="button" className="btn sm" onClick={() => setOpen({ kind: 'extra', option: null })}>
            + Add an extra
          </button>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <h2 className="h2" style={{ marginBottom: 12 }}>Meals &amp; sections</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <tbody>
              {live.meals.map((m, i) => {
                const last = i === live.meals.length - 1;
                const td: React.CSSProperties = { padding: '8px 0', borderBottom: last ? undefined : '1px solid #EEF0F3', verticalAlign: 'middle' };
                return (
                  <tr key={m.meal}>
                    <td style={{ ...td, color: '#4B5563', whiteSpace: 'nowrap', paddingRight: 12 }}>
                      {site.id} {m.meal}
                    </td>
                    <td style={td}>{sectionsSummary(m.sections)}</td>
                    <td style={{ ...td, textAlign: 'right', paddingLeft: 8 }}>
                      <button type="button" className="btn sm" onClick={() => setOpen({ kind: 'meal', meal: m.meal })} aria-label={`Change ${m.meal} sections`}>
                        Change
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {(noResidents || importNote) && (
          <section className="card" style={{ padding: 18 }}>
            <h2 className="h2" style={{ marginBottom: 6 }}>Import residents</h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4B5563' }}>
              Load residents, their drinks and seats from your residents file (.json). Works once, in a new app. To copy everything from another computer, use Restore a backup instead.
            </p>
            {noResidents && (
              <button type="button" className="btn sm" onClick={() => fileInput.current?.click()}>
                Choose file…
              </button>
            )}
            <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
            {importNote && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#374151' }}>{importNote}</p>}
          </section>
        )}

        <section className="card" style={{ padding: 18 }}>
          <h2 className="h2" style={{ marginBottom: 6 }}>Backups</h2>
          <p style={{ margin: '0 0 4px', fontSize: 14 }}>Every day, kept for {BACKUP_KEEP} days.</p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4B5563', wordBreak: 'break-all' }}>{dir ?? FALLBACK_DIR}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn sm" disabled={!desktop} onClick={() => void changeFolder()}>
              Change folder
            </button>
            <button type="button" className="btn sm" disabled={!desktop || !dir} onClick={() => dir && setOpen({ kind: 'restore', dir })}>
              Restore a backup
            </button>
          </div>
          {!desktop && <p style={{ margin: '12px 0 0', fontSize: 12, color: '#6B7280' }}>Backups work in the installed app.</p>}
          {note && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#374151' }}>{note}</p>}
        </section>
      </div>

      {open?.kind === 'drink' && <DrinkDialog site={site} drink={open.drink} onClose={() => setOpen(null)} />}
      {open?.kind === 'cup' && <CupDialog site={site} cup={open.cup} onClose={() => setOpen(null)} />}
      {open?.kind === 'extra' && <ExtraOptionDialog site={site} option={open.option} onClose={() => setOpen(null)} />}
      {open?.kind === 'meal' && <MealSectionsDialog site={site} meal={open.meal} onClose={() => setOpen(null)} />}
      {open?.kind === 'restore' && <RestoreDialog dir={open.dir} onRestore={restore} onClose={() => setOpen(null)} />}
    </div>
  );
}
