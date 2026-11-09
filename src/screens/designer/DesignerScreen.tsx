import { useMemo, useState } from 'react';
import type { DiningTable, Shape } from '../../domain/model';
import { clampX, clampY, NUDGE_STEP, overlapWarnings, roomScale, sectionSummary } from '../../domain/room';
import { act, actUndoable } from '../../state/act';
import { useStore } from '../../state/store';
import * as T from '../../state/tableActions';
import { Dialog } from '../../ui/Dialog';
import { useFitBox } from '../../ui/useFitBox';
import { Segmented } from '../../shell/Segmented';
import type { ScreenProps } from '../types';
import { DesignRoom } from './DesignRoom';

const chevron = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// Room Designer edits physical sections of the active layout, independent of meal.
export function DesignerScreen({ site }: ScreenProps) {
  const data = useStore((s) => s.data);
  const layout = data.layouts.find((l) => l.siteId === site.id && l.active);
  const siteTables = useMemo(() => data.tables.filter((t) => t.layoutId === layout?.id), [data.tables, layout?.id]);

  // Sections come from the meal setup as well as the tables, so a section emptied of tables still has its pill.
  const sections = useMemo(
    () => [...new Set([...site.meals.flatMap((m) => m.sections.map((s) => s.section)), ...siteTables.map((t) => t.section)])].sort((a, b) => a - b),
    [site.meals, siteTables],
  );
  const [picked, setPicked] = useState(sections[0] ?? 1);
  const section = sections.includes(picked) ? picked : (sections[0] ?? 1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<'add' | 'layout' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DiningTable | null>(null);
  const [roomRef, roomFit] = useFitBox<HTMLDivElement>(40);

  const tables = siteTables.filter((t) => t.section === section);
  const warnings = useMemo(() => overlapWarnings(siteTables), [siteTables]);
  const nWarn = tables.filter((t) => warnings.has(t.id)).length;
  const sel = tables.find((t) => t.id === selectedId) ?? null; // gone after Undo or a section switch → nothing selected
  const sum = sectionSummary(tables);
  const multi = sections.length > 1;
  const secName = multi ? `Section ${section}` : 'the dining room';

  const add = async (shape: Shape) => {
    setMenu(null);
    const { id, ops } = T.addTable(site.id, section, shape);
    if (await act(shape === 'round' ? 'Add round table' : 'Add rectangle table', ops)) setSelectedId(id);
  };
  const duplicate = async (t: DiningTable) => {
    const { id, ops } = T.duplicateTable(t.id);
    if (await act(`Duplicate Table ${t.number}`, ops)) setSelectedId(id);
  };
  const remove = (t: DiningTable) => {
    if (T.seatedAt(data, t.id).length) return setConfirmDelete(t);
    setSelectedId(null);
    void actUndoable(`Delete Table ${t.number}`, T.deleteTable(t.id), `Deleted Table ${t.number}`);
  };
  const nudge = (t: DiningTable, dx: number, dy: number) => act(`Move Table ${t.number}`, T.moveTable(t.id, clampX(t.x + dx), clampY(t.y + dy)));

  return (
    <div className="row-wrap">
      <section className="card" style={{ flex: '999 1 600px', minWidth: 0, padding: '16px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h1 className="h1">Room Designer</h1>
          <div style={{ flex: '1 1 10px' }} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="field" style={{ minWidth: 0 }} aria-haspopup="menu" aria-expanded={menu === 'layout'} onClick={() => setMenu(menu === 'layout' ? null : 'layout')}>
              <span>Layout: {layout?.name ?? 'Everyday'}</span>
              {chevron}
            </button>
            {menu === 'layout' && (
              <>
                <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div role="menu" className="menu" style={{ top: 44, left: 0, right: 'auto', width: 260 }}>
                  <button type="button" role="menuitemradio" aria-checked="true" onClick={() => setMenu(null)} style={{ fontWeight: 600 }}>
                    ✓ {layout?.name ?? 'Everyday'}
                  </button>
                  <p style={{ margin: 0, padding: '6px 10px 8px', fontSize: 12, color: '#4B5563', lineHeight: 1.4 }}>Event layouts, like Thanksgiving, come in a later version.</p>
                </div>
              </>
            )}
          </div>
          <button type="button" className="btn sm" onClick={() => act('Even out spacing', T.evenOutSpacing(site.id, section))}>
            Even out spacing
          </button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn sm primary" aria-haspopup="menu" aria-expanded={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add table
            </button>
            {menu === 'add' && (
              <>
                <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div role="menu" style={{ position: 'absolute', right: 0, top: 44, zIndex: 21, width: 280, padding: 6, background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 10px 30px rgba(17,24,39,.16)' }}>
                  <div style={{ padding: '8px 10px 6px', fontSize: 12, fontWeight: 600, color: '#4B5563' }}>Add to {secName}</div>
                  <button type="button" role="menuitem" className="addopt" onClick={() => add('round')}>
                    <svg viewBox="0 0 56 56" width="48" height="48" aria-hidden="true">
                      <circle cx="28" cy="28" r="13" fill="#F3F4F6" stroke="#4B5563" strokeWidth="1.5" />
                      <circle cx="28" cy="8" r="3.5" fill="#9CA3AF" />
                      <circle cx="28" cy="48" r="3.5" fill="#9CA3AF" />
                      <circle cx="8" cy="28" r="3.5" fill="#9CA3AF" />
                      <circle cx="48" cy="28" r="3.5" fill="#9CA3AF" />
                    </svg>
                    <span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111827' }}>Round table</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>4 seats</span>
                    </span>
                  </button>
                  <button type="button" role="menuitem" className="addopt" onClick={() => add('rect')}>
                    <svg viewBox="0 0 56 56" width="48" height="48" aria-hidden="true">
                      <rect x="10" y="20" width="36" height="16" rx="2.5" fill="#F3F4F6" stroke="#4B5563" strokeWidth="1.5" />
                      <circle cx="20" cy="12" r="3.5" fill="#9CA3AF" />
                      <circle cx="36" cy="12" r="3.5" fill="#9CA3AF" />
                      <circle cx="20" cy="44" r="3.5" fill="#9CA3AF" />
                      <circle cx="36" cy="44" r="3.5" fill="#9CA3AF" />
                      <circle cx="4" cy="28" r="3.5" fill="#9CA3AF" />
                      <circle cx="52" cy="28" r="3.5" fill="#9CA3AF" />
                    </svg>
                    <span>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#111827' }}>Rectangle table</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>6 seats</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4B5563' }}>Drag a table to move it. Click a table to rotate, duplicate or delete it.</p>
        {nWarn > 0 && (
          <div role="status" style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', fontSize: 14, color: '#7C2D12' }}>
            {nWarn === 1 ? '1 table needs attention: it’s too close to another table or a wall.' : `${nWarn} tables need attention: they’re too close to another table or a wall.`}
          </div>
        )}
        {multi && (
          <Segmented
            label="Section"
            role="tablist"
            options={sections.map((n) => ({ value: String(n), label: `Section ${n}` }))}
            value={String(section)}
            onChange={(v) => {
              setPicked(Number(v));
              setSelectedId(null);
            }}
            style={{ marginBottom: 10 }}
          />
        )}
        <div ref={roomRef} style={{ overflowX: 'auto', padding: 2, display: 'grid', justifyContent: 'safe center' }}>
          <DesignRoom
            tables={tables}
            scale={roomScale(roomFit.w, roomFit.h)}
            selectedId={sel?.id ?? null}
            warnings={warnings}
            onSelect={setSelectedId}
            onMove={(id, x, y) => act(`Move Table ${tables.find((t) => t.id === id)?.number ?? ''}`.trim(), T.moveTable(id, x, y))}
          />
        </div>
      </section>

      <aside className="card" style={{ flex: '1 1 280px', maxWidth: 360, padding: 18 }}>
        {!sel ? (
          <>
            <h2 className="h2" style={{ marginBottom: 8 }}>Table settings</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#4B5563', lineHeight: 1.5 }}>Click a table to rotate, duplicate or delete it. Use Add table to add one.</p>
            <div className="lbl" style={{ marginBottom: 8 }}>This room</div>
            <div style={{ fontSize: 14, color: '#1F2937', lineHeight: 1.7 }}>
              {multi ? `Section ${section}: ` : ''}
              {sum.tables} tables ({sum.round} round, {sum.rect} rectangle) · {sum.seats} seats
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#4B5563' }}>{sel.shape === 'round' ? 'Round · 4 seats' : 'Rectangle · 6 seats'}</div>
            <h2 style={{ margin: '2px 0 6px', fontSize: 20, fontWeight: 700 }}>Table {sel.number}</h2>
            <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 16 }}>{multi ? `Section ${sel.section}` : `${site.name} dining room`}</div>
            {warnings.has(sel.id) && (
              <div style={{ marginBottom: 14, padding: '8px 10px', borderRadius: 8, background: '#FFF7ED', border: '1px solid #FDBA74', fontSize: 13, color: '#7C2D12' }}>{warnings.get(sel.id)}</div>
            )}
            <div className="lbl" style={{ marginBottom: 8 }}>Rotate</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <button type="button" className="btn" aria-label="Rotate left 45 degrees" onClick={() => act(`Rotate Table ${sel.number}`, T.rotateTable(sel.id, -1))}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                45°
              </button>
              <span style={{ minWidth: 48, textAlign: 'center', fontSize: 16, fontWeight: 600 }}>{sel.rotation}°</span>
              <button type="button" className="btn" aria-label="Rotate right 45 degrees" onClick={() => act(`Rotate Table ${sel.number}`, T.rotateTable(sel.id, 1))}>
                45°
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </button>
            </div>
            <div className="lbl" style={{ marginBottom: 8 }}>Nudge</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 6, marginBottom: 18 }}>
              <span />
              <button type="button" className="btn" style={{ padding: 0, justifyContent: 'center' }} aria-label="Move up" onClick={() => nudge(sel, 0, -NUDGE_STEP)}>↑</button>
              <span />
              <button type="button" className="btn" style={{ padding: 0, justifyContent: 'center' }} aria-label="Move left" onClick={() => nudge(sel, -NUDGE_STEP, 0)}>←</button>
              <span />
              <button type="button" className="btn" style={{ padding: 0, justifyContent: 'center' }} aria-label="Move right" onClick={() => nudge(sel, NUDGE_STEP, 0)}>→</button>
              <span />
              <button type="button" className="btn" style={{ padding: 0, justifyContent: 'center' }} aria-label="Move down" onClick={() => nudge(sel, 0, NUDGE_STEP)}>↓</button>
              <span />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="btn sm" onClick={() => duplicate(sel)}>Duplicate</button>
              <button type="button" className="btn sm warn" onClick={() => remove(sel)}>Delete table</button>
              <button type="button" className="btn sm" onClick={() => setSelectedId(null)}>Done</button>
            </div>
          </>
        )}
      </aside>

      {confirmDelete && (
        <DeleteTableDialog
          table={confirmDelete}
          meals={T.seatedAt(data, confirmDelete.id).map((s) => s.meal)}
          onClose={() => setConfirmDelete(null)}
          onDeleted={() => {
            setConfirmDelete(null);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

// Not in the mockup (it deletes straight away). Shown only when residents sit at the table,
// because deleting it also frees their seats at every meal.
function DeleteTableDialog({ table: t, meals, onClose, onDeleted }: { table: DiningTable; meals: string[]; onClose: () => void; onDeleted: () => void }) {
  const byMeal = [...new Set(meals)].map((m) => [m, meals.filter((x) => x === m).length] as const);
  const who =
    byMeal.length === 1
      ? `${byMeal[0]![1]} ${byMeal[0]![1] === 1 ? 'resident sits' : 'residents sit'} here at ${byMeal[0]![0]}.`
      : `Residents sit here at ${byMeal.length} meals (${byMeal.map(([m, n]) => `${n} at ${m}`).join(', ')}).`;
  return (
    <Dialog
      title={`Delete Table ${t.number}?`}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn primary" onClick={() => actUndoable(`Delete Table ${t.number}`, T.deleteTable(t.id), `Deleted Table ${t.number}`).then((ok) => ok && onDeleted())}>
            Delete table
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
        {who} Deleting the table frees their seats, and they’ll show as “Not seated yet” until you seat them again. Undo puts the table and everyone back.
      </p>
    </Dialog>
  );
}
