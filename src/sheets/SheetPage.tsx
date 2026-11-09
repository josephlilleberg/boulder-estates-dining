import type { CSSProperties, ReactNode } from 'react';
import { CHAIR_PILL, CUP_BAND_H, type PrefRow, type ServerRoom, type SetupRoom, type TableDraw } from './model';
import type { PageData } from './pages';
import { CHAIR_LABEL } from '../domain/model';

// One printed page at true size (96 px per inch). View and Print preview scale it
// with a transform; the printed copy uses it as is. Styles copied from the mockup.

const roomBox = (w: number, h: number): CSSProperties => ({ position: 'relative', width: w, height: h, border: '1px solid #9CA3AF', borderRadius: 4, background: '#FFFFFF' });

function Table({ t }: { t: TableDraw }) {
  return (
    <div className="tbl" style={{ left: t.l, top: t.t, width: t.w, height: t.h, borderRadius: t.radius, transform: `rotate(${t.rotation}deg)`, background: t.bg, border: t.border }}>
      <div style={{ transform: `rotate(${-t.rotation}deg)`, textAlign: 'center', lineHeight: 1 }}>
        <div style={{ fontSize: t.fontSize, fontWeight: 700, color: '#111827' }}>{t.number}</div>
      </div>
    </div>
  );
}

/** Red "!" before a name: this resident has allergies or notes (see Allergies & notes). */
export function AlertBadge({ size = 11 }: { size?: number }) {
  return (
    <span
      aria-label="Allergies or notes"
      title="Allergies or notes"
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, borderRadius: '50%', background: '#DC2626', color: '#FFFFFF', fontSize: size - 3, fontWeight: 800, lineHeight: 1 }}
    >
      !
    </span>
  );
}

function ServerBody({ room }: { room: ServerRoom }) {
  return (
    <div style={roomBox(room.w, room.h)}>
      {room.tables.map((t) => (
        <Table key={t.id} t={t} />
      ))}
      {room.labels.map((l, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: l.l, top: l.t, width: l.w, height: l.h, transform: `rotate(${l.ang}deg)`, display: 'flex', flexDirection: l.dir, alignItems: 'center', justifyContent: 'flex-start', gap: 2, textAlign: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14, lineHeight: '14px', maxWidth: '100%', fontSize: 11, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {l.alert && <AlertBadge />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
          </div>
          {l.items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {l.items.map((it, k) => (
                <div
                  key={k}
                  style={{ boxSizing: 'border-box', minWidth: 30, padding: 0, overflow: 'hidden', border: '1px solid #111827', borderRadius: 4, background: it.bg, fontSize: 11, lineHeight: 1, fontWeight: 700, color: it.color, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div style={{ display: 'flex', height: 16, justifyContent: 'center' }}>
                    {it.half && <span style={{ display: 'flex', alignItems: 'center', padding: '0 3px', background: '#111827', color: '#FFFFFF', fontSize: 12 }}>½</span>}
                    <span style={{ display: 'flex', alignItems: 'center', padding: '0 6px' }}>{it.cap}</span>
                  </div>
                  {/* Not the drink's usual cup: named in a dark band, the same dark as the ½ tab. */}
                  {it.cup && (
                    <div style={{ height: CUP_BAND_H, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', background: '#111827', color: '#FFFFFF', fontSize: 8, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{it.cup}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SetupBody({ room }: { room: SetupRoom }) {
  return (
    <div style={roomBox(room.w, room.h)}>
      {room.tables.map((t) => (
        <Table key={t.id} t={t} />
      ))}
      {room.dividers.map((d, i) => (
        <div key={i} data-sheet-divider style={{ position: 'absolute', left: d.l, top: 0, width: 0, height: d.h, borderLeft: '1px solid #E5E7EB' }} />
      ))}
      {room.titles.map((t, i) => (
        <div key={i} style={{ position: 'absolute', left: t.l, top: t.t, fontSize: 16, fontWeight: 700, color: '#111827' }}>
          {t.text}
        </div>
      ))}
      {room.pills.map((p, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{ position: 'absolute', left: p.l, top: p.t, width: p.w, height: p.h, boxSizing: 'border-box', borderRadius: 4, background: CHAIR_PILL[p.chair].bg, border: CHAIR_PILL[p.chair].border, transform: `rotate(${p.ang}deg)` }}
        />
      ))}
      {room.changes.map((c, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: c.l, top: c.t, width: c.w, height: c.h, transform: `rotate(${c.ang}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          {c.items.map((it, k) => (
            <span
              key={k}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', height: 16, padding: '0 6px', border: '1px solid #111827', borderRadius: 8, background: it.bg, fontSize: 10, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', flex: 'none' }}
            >
              {it.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

const swatch = (s: CSSProperties) => <span style={{ display: 'inline-block', boxSizing: 'border-box', borderRadius: 4, ...s }} />;
const tag = (bg: string, text: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', border: '1px solid #111827', borderRadius: 9, background: bg, fontSize: 11, fontWeight: 700 }}>{text}</span>
);
const key = (mark: ReactNode, text: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
    {mark}
    <span>{text}</span>
  </span>
);

/** The setup sheet's key. `vertical` stacks it (View puts it beside the drawing). */
export function SetupLegend({ vertical = false }: { vertical?: boolean }) {
  const grid = (cols: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: Array(vertical ? 1 : cols).fill('max-content').join(' '), gap: '6px 18px' });
  const div: CSSProperties | undefined = vertical ? { borderLeft: 0, borderTop: '1px solid #D1D5DB' } : undefined;
  return (
    <div data-sheet-legend style={{ marginTop: vertical ? 0 : 12, width: 'max-content', maxWidth: '100%', display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'stretch', border: '1px solid #D1D5DB', borderRadius: 8, overflow: 'hidden', fontSize: 13, color: '#111827', background: '#FFFFFF' }}>
      <div className="lgcell">
        <div className="lghead">Resident seats</div>
        <div style={grid(3)}>
          {key(swatch({ width: 20, height: 8, background: CHAIR_PILL.arm.bg }), CHAIR_LABEL.arm)}
          {key(swatch({ width: 20, height: 8, background: CHAIR_PILL.no_arm.bg, border: CHAIR_PILL.no_arm.border }), CHAIR_LABEL.no_arm)}
          {key(swatch({ width: 20, height: 8, background: '#FFFFFF', border: CHAIR_PILL.none.border }), CHAIR_LABEL.none)}
        </div>
      </div>
      <div className="lgcell lgdiv" style={div}>
        <div className="lghead">Labels</div>
        <div style={grid(2)}>
          {key(tag('#86EFAC', '+ Item'), 'Add drinkware')}
          {key(tag('#FCA5A5', '− Item'), 'Remove drinkware')}
        </div>
      </div>
      <div className="lgcell lgdiv" style={div}>
        <div className="lghead">Tables</div>
        <div style={grid(1)}>{key(swatch({ width: 24, height: 14, background: '#EDE9FE', border: '1.5px solid #6D28D9' }), 'Creamer tray')}</div>
      </div>
    </div>
  );
}

const PREF_COLS = '90px 210px minmax(0, 1fr) 110px';

function PrefsBody({ rows }: { rows: PrefRow[] }) {
  return (
    <div style={{ height: 692, paddingTop: 14, boxSizing: 'border-box', overflow: 'hidden' }}>
      {!rows.length && <p style={{ fontSize: 14, color: '#4B5563' }}>No one seated at this meal has notes or a half portion.</p>}
      <div style={{ fontSize: 13, color: '#111827' }}>
        <div style={{ display: 'grid', gridTemplateColumns: PREF_COLS, fontSize: 11, fontWeight: 600, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #D1D5DB' }}>
          <div style={{ padding: '6px 8px' }}>Table</div>
          <div style={{ padding: '6px 8px' }}>Resident</div>
          <div style={{ padding: '6px 8px' }}>Allergies &amp; notes</div>
          <div style={{ padding: '6px 8px' }}>Portion</div>
        </div>
        {rows.map((r, i) =>
          r.head ? (
            <div key={i} style={{ padding: '14px 8px 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>
              {r.label}
            </div>
          ) : (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: PREF_COLS, borderBottom: '1px solid #F0F1F3' }}>
              <div style={{ padding: '6px 8px', color: '#4B5563' }}>{r.table}</div>
              <div style={{ padding: '6px 8px', fontWeight: 600 }}>{r.name}</div>
              <div style={{ padding: '6px 8px' }}>{r.notes}</div>
              <div style={{ padding: '6px 8px' }}>{r.portion}</div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function SheetPage({ page, shadow = true }: { page: PageData; shadow?: boolean }) {
  const b = page.body;
  return (
    <div
      className="sheet-page"
      style={{ width: page.w, height: page.h, background: '#FFFFFF', boxShadow: shadow ? '0 2px 10px rgba(0,0,0,.18)' : undefined, boxSizing: 'border-box', padding: '28px 40px 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '1px solid #D1D5DB' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{page.title}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, color: '#4B5563' }}>{page.right}</div>
        </div>
      </div>

      {b.kind === 'prefs' ? (
        <PrefsBody rows={b.rows} />
      ) : (
        <div
          style={{ height: b.kind === 'setup' ? page.h - 150 : page.h - 124, boxSizing: 'border-box', paddingTop: 12, display: 'grid', gridTemplateColumns: 'max-content', gap: '12px 20px', alignContent: b.kind === 'setup' ? 'start' : 'center', justifyContent: 'center' }}
        >
          <div data-sheet-room>{b.kind === 'server' ? <ServerBody room={b.room} /> : <SetupBody room={b.room} />}</div>
          {b.kind === 'setup' && <SetupLegend />}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #E5E7EB', fontSize: 10.5, color: '#4B5563' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6B7280' }}>{page.legendHead}</span>
          <span>{page.legendText}</span>
        </div>
        <div style={{ whiteSpace: 'nowrap' }}>{page.footer}</div>
      </div>
    </div>
  );
}

/** A page scaled by `k` inside a box of the scaled size (so layout around it is right). */
export function ScaledPage({ page, k }: { page: PageData; k: number }) {
  return (
    <div style={{ width: Math.round(page.w * k), height: Math.round(page.h * k), margin: '0 auto', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${k})`, transformOrigin: '0 0' }}>
        <SheetPage page={page} />
      </div>
    </div>
  );
}
