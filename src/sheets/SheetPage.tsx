import type { CSSProperties, ReactNode } from 'react';
import { CHAIR_PILL, CUP_BAND_H, NAME_GAP, NOTES_COLS, NOTES_LINE_H, PILL_GAP, PILL_ROW_H, type ServerNote, type ServerRoom, type SetupRoom, type TableDraw } from './model';
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

/** Red "!" before a name in the app (Seating): this resident has allergies or notes. */
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
        // The seat's label, turned to face the table; drawn at full size inside, then scaled to
        // the sheet's scale (smaller only when a full section needs the room).
        <div key={i} style={{ position: 'absolute', left: l.l, top: l.t, width: l.w, height: l.h, transform: `rotate(${l.ang}deg)` }}>
          <div
            style={{ width: l.w / l.scale, height: l.h / l.scale, transform: l.scale < 1 ? `scale(${l.scale})` : undefined, transformOrigin: '0 0', display: 'flex', flexDirection: l.dir, alignItems: 'center', justifyContent: 'flex-start', gap: NAME_GAP, textAlign: 'center' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14, lineHeight: '14px', maxWidth: '100%', fontSize: 11, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
            </div>
            {l.items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: PILL_GAP }}>
                {l.items.map((it, k) => (
                  <div
                    key={k}
                    style={{ boxSizing: 'border-box', width: l.pillW, padding: 0, overflow: 'hidden', border: '1px solid #111827', borderRadius: 4, background: it.bg, fontSize: 11, lineHeight: 1, fontWeight: 700, color: it.color, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    {/* A dark rule under the drink, then the band's white line: dark | white | dark. Inside the row, so nothing grows. */}
                    <div style={{ display: 'flex', height: PILL_ROW_H, boxShadow: it.cup ? 'inset 0 -1px 0 #111827' : undefined }}>
                      {it.half && <span style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0 3px', background: '#111827', color: '#FFFFFF', fontSize: 12 }}>½</span>}
                      <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{it.cap}</span>
                    </div>
                    {/* The band: what the server fills (or which tea), in the same dark as the ½ tab. A white
                        hairline separates it from the drink on every pill. */}
                    {it.cup && (
                      <div style={{ height: CUP_BAND_H, boxSizing: 'border-box', borderTop: '1px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', background: '#111827', color: '#FFFFFF', fontSize: 7.5, lineHeight: 1, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{it.cup}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
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

/** Page height a server drawing gives up for its notes. */
const roomTrim = (b: PageData['body']) => (b.kind === 'server' ? Math.round((b.room.h + 2) * (1 - b.roomScale)) : 0);

/**
 * A server sheet's notes: allergies, notes and ½ portions by table, in columns under the drawing.
 * Replaces the red ! on labels; the server finds the person by table and name.
 */
export function ServerNotes({ notes }: { notes: ServerNote[] }) {
  if (!notes.length) return <div style={{ fontSize: 10.5, color: '#6B7280' }}>No allergies, notes or half portions in this section.</div>;
  return (
    <div style={{ columnCount: NOTES_COLS, columnGap: 16, fontSize: 10.5, lineHeight: `${NOTES_LINE_H}px`, color: '#111827' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6B7280' }}>Notes</div>
      {notes.map((n, i) => (
        <div key={i} style={{ breakInside: 'avoid' }}>
          <b>
            T{n.table} · {n.name}
          </b>{' '}
          — {n.text}
        </div>
      ))}
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

        <div
          style={{ height: b.kind === 'setup' ? page.h - 150 : page.h - 124 - roomTrim(b), boxSizing: 'border-box', paddingTop: 12, display: 'grid', gridTemplateColumns: 'max-content', gap: '12px 20px', alignContent: b.kind === 'setup' ? 'start' : 'center', justifyContent: 'center' }}
        >
          <div data-sheet-room>
            {b.kind === 'server' ? (
              // Drawn smaller only when a long notes list needs the room.
              <div style={{ width: (b.room.w + 2) * b.roomScale, height: (b.room.h + 2) * b.roomScale }}>
                <div style={{ transform: b.roomScale < 1 ? `scale(${b.roomScale})` : undefined, transformOrigin: '0 0' }}>
                  <ServerBody room={b.room} />
                </div>
              </div>
            ) : (
              // Drawn smaller only when the sections' chips need more width than the page has.
              <div style={{ width: (b.room.w + 2) * b.room.scale, height: (b.room.h + 2) * b.room.scale }}>
                <div style={{ transform: b.room.scale < 1 ? `scale(${b.room.scale})` : undefined, transformOrigin: '0 0' }}>
                  <SetupBody room={b.room} />
                </div>
              </div>
            )}
          </div>
          {b.kind === 'setup' && <SetupLegend />}
        </div>

      {b.kind === 'server' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid #E5E7EB', fontSize: 10.5, color: '#4B5563' }}>
          <div style={{ flex: 1, paddingTop: 6 }}>
            <ServerNotes notes={b.notes} />
          </div>
          <div style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap', padding: '2px 0 8px' }}>{page.footer}</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderTop: '1px solid #E5E7EB', fontSize: 10.5, color: '#4B5563' }}>
          <div style={{ whiteSpace: 'nowrap' }}>{page.footer}</div>
        </div>
      )}
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
