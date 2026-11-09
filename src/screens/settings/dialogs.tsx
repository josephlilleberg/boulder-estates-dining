import { useEffect, useState } from 'react';
import type { AppData } from '../../db/repo';
import type { BackupFile } from '../../db/types';
import type { Beverage, BeverageKind, ExtraOption } from '../../domain/model';
import { DRINK_PALETTE, nextColor, textColorFor } from '../../domain/palette';
import type { MealName, Site } from '../../domain/sites';
import { act, actUndoable } from '../../state/act';
import type { Op } from '../../state/ops';
import * as S from '../../state/settingsActions';
import { getStore, useStore } from '../../state/store';
import { Dialog, Field } from '../../ui/Dialog';
import { SwitchMark } from '../../ui/Switch';

// Settings forms. The mockup only shows "+ Add a drink" and the two backup
// buttons; these follow the resident-card dialogs so they feel the same.

/** Runs an action against current data without saving, to show its problem inline. */
function problem(data: AppData, ops: (d: AppData) => Op[]): string | null {
  try {
    ops(data);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const Problem = ({ text }: { text: string | null }) => (text ? <p style={{ margin: 0, fontSize: 13, color: '#9A3412' }}>{text}</p> : null);

const Tick = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label="Colour">
      {DRINK_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          onClick={() => onPick(c)}
          style={{ width: 32, height: 32, borderRadius: 8, background: c, border: c === value ? '3px solid #111827' : '1px solid #111827', cursor: 'pointer', padding: 0 }}
        />
      ))}
    </div>
  );
}

/** What the server sheet will print: the pill with its short name. */
function PillPreview({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', height: 18, padding: '0 6px', border: '1px solid #111827', borderRadius: 4, background: color, fontSize: 11, fontWeight: 700, color: textColorFor(color) === '#FFFFFF' ? '#FFFFFF' : '#111827', whiteSpace: 'nowrap' }}>
      {text || '—'}
    </span>
  );
}

// ---- Drinks ---------------------------------------------------------------------

export function DrinkDialog({ site, drink, onClose }: { site: Site; drink: Beverage | null; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const siteBevs = data.beverages.filter((b) => b.siteId === site.id);
  const [name, setName] = useState(drink?.name ?? '');
  const [short, setShort] = useState(drink?.shortLabel ?? '');
  const [kind, setKind] = useState<BeverageKind>(drink?.kind ?? 'juice');
  const [color, setColor] = useState<string>(drink?.color ?? nextColor(siteBevs.map((b) => b.color)));
  const isCoffee = drink?.kind === 'coffee';
  const users = drink ? S.drinkUsers(data, site.id, drink.name) : 0;

  const ops = drink
    ? S.updateBeverage(site.id, drink.name, { name, shortLabel: short || name, ...(isCoffee ? {} : { color }) })
    : S.addBeverage(site.id, { name, shortLabel: short || name, kind, color });
  const err = name.trim() ? problem(data, ops) : null;

  const save = async () => {
    if (!name.trim() || err) return;
    if (await act(drink ? `Edit ${drink.name}` : `Add ${name.trim()}`, ops)) onClose();
  };

  return (
    <Dialog
      title={drink ? drink.name : 'Add a drink'}
      subtitle={drink ? (users ? `${users} resident${users === 1 ? ' has' : 's have'} it` : 'No one has it yet') : `${site.name} · shows up on the resident card right away`}
      onClose={onClose}
      footer={
        <>
          {drink && !isCoffee && (
            <button
              type="button"
              className="btn sm warn"
              disabled={users > 0}
              title={users ? 'Change their drinks first' : undefined}
              onClick={async () => {
                if (await act(`Remove ${drink.name}`, S.removeBeverage(site.id, drink.name))) onClose();
              }}
            >
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="drink-form" className="btn primary" disabled={!name.trim() || !!err}>
            {drink ? 'Save' : 'Add drink'}
          </button>
        </>
      }
    >
      <form
        id="drink-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Field label="Name">
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grape Juice" autoComplete="off" />
        </Field>
        {!drink && (
          <Field label="Kind">
            <div className="segwrap" role="group" aria-label="Kind" style={{ alignSelf: 'flex-start' }}>
              {S.NEW_DRINK_KINDS.map((k) => (
                <button key={k.kind} type="button" className={k.kind === kind ? 'seg on' : 'seg'} aria-pressed={k.kind === kind} onClick={() => setKind(k.kind)}>
                  {k.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#4B5563' }}>
              Served in a {S.NEW_DRINK_KINDS.find((k) => k.kind === kind)!.cup.toLowerCase()}.{kind === 'juice' ? ' Juice is never marked half.' : ''}
            </span>
          </Field>
        )}
        {!isCoffee && (
          <>
            <Field label="Printed on server sheets as">
              <input className="text-input" value={short} onChange={(e) => setShort(e.target.value)} placeholder={name.trim() || 'Short name'} maxLength={14} autoComplete="off" />
            </Field>
            <Field label="Colour">
              <Swatches value={color} onPick={setColor} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4B5563' }}>
                Preview <PillPreview text={(short || name).trim()} color={color} />
              </div>
            </Field>
          </>
        )}
        {isCoffee && <p style={{ margin: 0, fontSize: 13, color: '#4B5563' }}>Coffee isn’t printed on server sheets; everyone is offered it.</p>}
        <Problem text={err} />
      </form>
    </Dialog>
  );
}

// ---- Cups -------------------------------------------------------------------------

export function CupDialog({ site, cup, onClose }: { site: Site; cup: string | null; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const [name, setName] = useState('');
  const core = cup !== null && S.CORE_DRINKWARE.includes(cup);
  const users = cup ? S.cupUsers(data, site.id, cup) : 0;
  const err = cup ? problem(data, S.removeDrinkware(site.id, cup)) : name.trim() ? problem(data, S.addDrinkware(site.id, name)) : null;

  if (cup) {
    return (
      <Dialog
        title={cup}
        subtitle={users ? `${users} resident${users === 1 ? ' uses' : 's use'} it` : 'No one uses it yet'}
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              className="btn sm warn"
              disabled={!!err}
              onClick={async () => {
                if (await act(`Remove ${cup}`, S.removeDrinkware(site.id, cup))) onClose();
              }}
            >
              Remove
            </button>
            <span className="spacer" />
            <button type="button" className="btn primary" onClick={onClose} data-autofocus>
              Done
            </button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>{core ? `The setup sheet counts the ${cup.toLowerCase()}, so it stays on the list.` : (err ?? 'Not used by anyone, so it can be removed.')}</p>
      </Dialog>
    );
  }
  const save = async () => {
    if (!name.trim() || err) return;
    if (await act(`Add ${name.trim()}`, S.addDrinkware(site.id, name))) onClose();
  };
  return (
    <Dialog
      title="Add a cup"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="cup-form" className="btn primary" disabled={!name.trim() || !!err}>
            Add cup
          </button>
        </>
      }
    >
      <form
        id="cup-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Field label="Name">
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sippy cup" autoComplete="off" />
        </Field>
        <Problem text={err} />
      </form>
    </Dialog>
  );
}

// ---- Extras -------------------------------------------------------------------------

export function ExtraOptionDialog({ site, option, onClose }: { site: Site; option: ExtraOption | null; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const [name, setName] = useState(option?.name ?? '');
  const [kinds, setKinds] = useState(option?.variants.join(', ') ?? '');
  const [allMeals, setAllMeals] = useState(option?.allMeals ?? false);
  const [counted, setCounted] = useState(option?.counted ?? true);
  const input = { name, variants: kinds.split(','), allMeals, counted };
  const ops = S.saveExtraOption(site.id, option?.name ?? null, input);
  const err = name.trim() ? problem(data, ops) : null;

  const save = async () => {
    if (!name.trim() || err) return;
    if (await act(option ? `Edit ${option.name}` : `Add ${name.trim()}`, ops)) onClose();
  };

  return (
    <Dialog
      title={option ? option.name : 'Add an extra'}
      subtitle="Offered under “Add an extra” on the resident card. Residents who already have it keep it."
      onClose={onClose}
      footer={
        <>
          {option && (
            <button
              type="button"
              className="btn sm warn"
              onClick={async () => {
                if (await act(`Remove ${option.name}`, S.removeExtraOption(site.id, option.name))) onClose();
              }}
            >
              Remove
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="extra-form" className="btn primary" disabled={!name.trim() || !!err}>
            {option ? 'Save' : 'Add extra'}
          </button>
        </>
      }
    >
      <form
        id="extra-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Field label="Name">
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Syrup" autoComplete="off" />
        </Field>
        <Field label="Kinds to pick from (optional)">
          <input className="text-input" value={kinds} onChange={(e) => setKinds(e.target.value)} placeholder="e.g. Grape, Mixed Fruit" autoComplete="off" />
        </Field>
        <div className="group">
          <button type="button" className="grow" aria-pressed={allMeals} onClick={() => setAllMeals(!allMeals)}>
            <span style={{ flex: 1, fontSize: 14, color: '#111827' }}>
              Offered at every meal
              <span style={{ display: 'block', fontSize: 12, color: '#4B5563' }}>Off: Breakfast only</span>
            </span>
            <SwitchMark on={allMeals} />
          </button>
          <button type="button" className="grow" aria-pressed={counted} onClick={() => setCounted(!counted)}>
            <span style={{ flex: 1, fontSize: 14, color: '#111827' }}>Ask how many</span>
            <SwitchMark on={counted} />
          </button>
        </div>
        <Problem text={err} />
      </form>
    </Dialog>
  );
}

// ---- Meals & sections -------------------------------------------------------------------

export function MealSectionsDialog({ site, meal, onClose }: { site: Site; meal: MealName; onClose: () => void }) {
  const data = useStore((s) => s.data);
  const live = data.sites.find((s) => s.id === site.id)!;
  const open = live.meals.find((m) => m.meal === meal)!.sections;
  const [names, setNames] = useState<Record<number, string>>({});
  const nameOf = (sec: number) => names[sec] ?? open.find((s) => s.section === sec)?.label ?? '';

  return (
    <Dialog
      title={`${meal} sections`}
      subtitle="Which tables open, and what the section is called on Seating and the sheets"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose} data-autofocus>
            Done
          </button>
        </>
      }
    >
      <div className="group">
        {live.sections.map((sec) => {
          const o = open.find((s) => s.section === sec);
          const seated = o ? S.seatsInSection(data, site.id, meal, sec).length : 0;
          const label = nameOf(sec);
          const renameErr = o && label !== o.label ? problem(data, S.renameSection(site.id, meal, sec, label)) : null;
          return (
            <div key={sec} className="grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="check-row"
                aria-pressed={!!o}
                disabled={!!o && open.length === 1}
                title={o && open.length === 1 ? `${meal} needs at least one section` : undefined}
                onClick={() => {
                  if (o && seated && !window.confirm(`${seated} resident${seated === 1 ? ' is' : 's are'} seated at the Section ${sec} tables for ${meal}. Close it and move them back to waiting? (Undo brings them back.)`)) return;
                  const label = `${o ? 'Close' : 'Open'} Section ${sec} tables at ${meal}`;
                  void (o ? actUndoable(label, S.setSectionOpen(site.id, meal, sec, false), `Closed the Section ${sec} tables at ${meal}`) : act(label, S.setSectionOpen(site.id, meal, sec, true)));
                }}
              >
                <span className={o ? 'box on' : 'box'}>
                  <Tick />
                </span>
                Section {sec} tables
              </button>
              {o && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  <span style={{ fontSize: 13, color: '#4B5563' }}>called</span>
                  <input
                    className="text-input"
                    style={{ width: 150, height: 36 }}
                    aria-label={`Name for the Section ${sec} tables at ${meal}`}
                    value={label}
                    onChange={(e) => setNames({ ...names, [sec]: e.target.value })}
                    onBlur={() => {
                      if (label !== o.label && !renameErr) void act(`Rename ${o.label} to ${label.trim()}`, S.renameSection(site.id, meal, sec, label));
                      setNames(({ [sec]: _, ...rest }) => rest);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </div>
              )}
              {renameErr && <div style={{ flexBasis: '100%', fontSize: 12, color: '#9A3412' }}>{renameErr}</div>}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

// ---- Restore ----------------------------------------------------------------------------

/** "Friday, Nov 6, 2026" for a daily backup; "Before a restore · Nov 7, 2026, 9:30 AM" for a safety copy. */
export function backupTitle(name: string): string {
  const d = /^dining-(\d{4})-(\d{2})-(\d{2})\.sqlite3$/.exec(name);
  if (d) return new Date(+d[1]!, +d[2]! - 1, +d[3]!).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const s = /^before-restore-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite3$/.exec(name);
  if (s) {
    const t = new Date(+s[1]!, +s[2]! - 1, +s[3]!, +s[4]!, +s[5]!);
    return `Before a restore · ${t.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  }
  return name;
}

export function RestoreDialog({ dir, onRestore, onClose }: { dir: string; onRestore: (file: BackupFile) => Promise<void>; onClose: () => void }) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getStore()
      .database.listBackups(dir)
      .then((f) => live && setFiles(f))
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [dir]);

  return (
    <Dialog
      title="Restore a backup"
      subtitle={dir}
      width={500}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!pick || busy}
            onClick={async () => {
              if (!pick) return;
              setBusy(true);
              try {
                await onRestore(pick);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </>
      }
    >
      {files === null && !error && <p style={{ margin: 0, fontSize: 14, color: '#4B5563' }}>Looking for backups…</p>}
      {files?.length === 0 && <p style={{ margin: 0, fontSize: 14, color: '#4B5563' }}>No backups in this folder yet. One is made every day the app is open.</p>}
      {!!files?.length && (
        <div className="group" role="radiogroup" aria-label="Backups" style={{ maxHeight: 300, overflowY: 'auto' }}>
          {files.map((f) => (
            <button key={f.path} type="button" role="radio" aria-checked={pick?.path === f.path} className="grow" onClick={() => setPick(f)} style={pick?.path === f.path ? { background: '#EFF6FF' } : undefined}>
              <span style={{ flex: 1, fontSize: 14, color: '#111827', fontWeight: pick?.path === f.path ? 600 : 400 }}>{backupTitle(f.name)}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{Math.max(1, Math.round(f.bytes / 1024))} KB</span>
            </button>
          ))}
        </div>
      )}
      {pick && (
        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
          Everything goes back to how it was in this backup. Today’s data is saved first as “Before a restore”, so you can come back to it. Undo history is cleared.
        </p>
      )}
      <Problem text={error} />
    </Dialog>
  );
}
