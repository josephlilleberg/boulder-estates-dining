import { Fragment, useId, type CSSProperties, type ReactNode } from 'react';
import { BOX_LINE_H, BOX_PAD, BULLET_W, CHAIR_PILL, CHIP_CHAR_W, CHIP_H, CHIP_PAD, chipW, CUP_BAND_H, EXTRA_BG, itemH, NO_MUG, type Change, type MugMark, type SeatPill, NAME_GAP, NOTES_COLS, NOTES_LINE_H, PILL_GAP, PILL_ROW_H, type ServerNote, type ServerRoom, type SetupRoom, type TableDraw } from './model';
import { PAGE_CHROME, type PageData } from './pages';
import { CHAIR_LABEL, type Chair } from '../domain/model';

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
      {room.pills.map((p, i) => (
        <ChairPill key={i} p={p} />
      ))}
      {room.mugs.map((m, i) => (
        <MugMarker key={i} m={m} />
      ))}
      {room.labels.map((l, i) => (
        // The seat's label, turned to face the table; drawn at full size inside, then scaled to
        // the sheet's scale (smaller only when a full section needs the room).
        <div key={i} style={{ position: 'absolute', left: l.l, top: l.t, width: l.w, height: l.h, transform: `rotate(${l.ang}deg)` }}>
          <div
            style={{ width: l.w / l.scale, height: l.h / l.scale, zoom: l.scale < 1 ? l.scale : undefined, display: 'flex', flexDirection: l.dir, alignItems: 'center', justifyContent: 'flex-start', gap: NAME_GAP, textAlign: 'center' }}
          >
            {/* A setup-only label (Breakfast's setup sheet) has no name: just the chips. */}
            {l.name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 14, lineHeight: '14px', maxWidth: '100%', fontSize: 11, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              </div>
            )}
            {l.items.length > 0 && (
              // Same direction as the label, so the first pill (milk, then juice…) is always next to the name.
              <div style={{ display: 'flex', flexDirection: l.dir, alignItems: 'center', gap: PILL_GAP }}>
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
                      <div style={{ position: 'relative', height: CUP_BAND_H, boxSizing: 'border-box', borderTop: '1px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: it.plus ? `0 4px 0 ${CUP_BAND_H + 1}px` : '0 4px', background: '#111827', color: '#FFFFFF', fontSize: 7.5, lineHeight: 1, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                        {/* Supper: this cup is added to the usual setting. */}
                        {it.plus && (
                          <span style={{ position: 'absolute', left: 1, top: 0.5, width: CUP_BAND_H - 2.5, height: CUP_BAND_H - 2.5, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#86EFAC', color: '#111827', borderRadius: 1.5, fontSize: 9, fontWeight: 900, letterSpacing: 0 }}>
                            +
                          </span>
                        )}
                        {it.cup}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Supper's combined sheet: the extras, furthest from the table. */}
            {l.chips.length > 0 && (
              <div style={{ display: 'flex', flexDirection: l.dir, alignItems: 'center', gap: 3 }}>
                {l.chips.map((c, k) => (
                  <Chip key={k} c={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chips and the extras box share one type: same face, size and weight. */
const chipText: CSSProperties = { fontFamily: 'inherit', fontSize: 9, fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' };

/** 9 px, or a little less for a line longer than the sheet's chip width allows (one line per extra, never wrapped). */
const fitSize = (t: string, c: Change, gutter = 0) => Math.min(9, Math.floor(((9 * (chipW(c) - CHIP_PAD - gutter)) / textW(t)) * 10) / 10);

/** Width of a line in 9 px bold Inter, measured (the estimate in the model is cautious, for layout). */
let measurer: CanvasRenderingContext2D | null | undefined;
function textW(t: string): number {
  if (measurer === undefined) measurer = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!measurer) return t.length * CHIP_CHAR_W;
  measurer.font = '700 9px Inter, system-ui, sans-serif';
  return measurer.measureText(t).width;
}

/** One setup chip (+Glass…), or the seat's extras box, as on the setup sheet. */
function Chip({ c }: { c: Change }) {
  // The extras box: one pale-yellow box, an extra per line. The lines share a left edge, and that
  // block sits centred in the box.
  if (c.lines)
    return (
      <div
        style={{ ...chipText, display: 'flex', justifyContent: 'center', boxSizing: 'border-box', width: chipW(c), height: itemH(c), padding: '2px 3px', border: '1px solid #111827', borderRadius: 5, background: c.bg, lineHeight: `${BOX_LINE_H}px`, overflow: 'hidden', flex: 'none' }}
      >
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          {(c.rows ?? c.lines.map((text) => ({ text, indent: 0, bullet: false }))).map((row, i) => (
            <div key={i} style={{ display: 'flex', paddingLeft: row.indent }}>
              {/* A kind under its extra: a bullet, then the kind. */}
              {row.bullet && <span style={{ width: BULLET_W, flex: 'none' }}>•</span>}
              <span style={{ fontSize: fitSize(row.text, c, row.indent + (row.bullet ? BULLET_W : 0) - (CHIP_PAD - BOX_PAD)) }}>{row.text}</span>
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <span style={{ ...chipText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width: chipW(c), height: CHIP_H, padding: '0 4px', border: '1px solid #111827', borderRadius: CHIP_H / 2, background: c.bg, lineHeight: 1, color: c.color ?? '#111827', overflow: 'hidden', flex: 'none' }}>
      <span style={{ fontSize: fitSize(c.text, c) }}>{c.text}</span>
    </span>
  );
}

/** "Mug" on the table at a seat: take the mug away (no coffee or tea). */
function MugMarker({ m }: { m: MugMark }) {
  if (m.dot) return <div aria-hidden="true" style={{ position: 'absolute', left: m.l, top: m.t, width: m.w, height: m.h, borderRadius: '50%', background: NO_MUG.bg, border: '1px solid #111827', boxSizing: 'border-box' }} />;
  return (
    <div style={{ position: 'absolute', left: m.l, top: m.t, width: m.w, height: m.h, transform: `rotate(${m.ang}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: '1px solid #111827', borderRadius: 6, background: NO_MUG.bg, color: NO_MUG.color, fontSize: 8, fontWeight: 800, lineHeight: 1 }}>
      Mug
    </div>
  );
}

/** A chair pill on a table edge: the chair type, as in the key. */
/** Corner radius of a chair mark with words: softly rounded, not a pill, so the words get its whole length. */
const WORD_R = 4;

function ChairPill({ p }: { p: SeatPill }) {
  const look = CHAIR_PILL[p.chair];
  if (p.arc) return <ArcChairPill p={p} arc={p.arc} />;
  if (look.text)
    return (
      <div style={{ position: 'absolute', left: p.l, top: p.t, width: p.w, height: p.h, transform: `rotate(${p.ang}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: look.border, borderRadius: WORD_R * (p.k ?? 1), background: look.bg, color: look.color, fontSize: 9 * (p.k ?? 1), fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
        {look.text}
      </div>
    );
  return <div aria-hidden="true" style={{ position: 'absolute', left: p.l, top: p.t, width: p.w, height: p.h, boxSizing: 'border-box', borderRadius: p.h / 2, background: look.bg, border: look.border, transform: `rotate(${p.ang}deg)` }} />;
}

/**
 * A chair mark on a round table, bent along the table's edge: a thick arc (its outline drawn underneath),
 * with round ends for the plain arm chair bar and square ends when it carries words (they get its whole
 * length), and the words following the curve, upright at every seat.
 */
function ArcChairPill({ p, arc }: { p: SeatPill; arc: NonNullable<SeatPill['arc']> }) {
  const look = CHAIR_PILL[p.chair];
  const [bw, bc] = (() => {
    const m = look.border.match(/^([\d.]+)px solid (#\w+)$/);
    return m ? [Number(m[1]), m[2]!] : [1, '#111827'];
  })();
  const { r, a } = arc;
  const h = p.h;
  const C = r + h;
  // Half the arc's angle: with round ends, the arc plus its ends is the mark's width; square ends are the
  // whole width, and the fill stops short of them by the outline's width so the outline closes the ends.
  const cap = look.text ? 'butt' : 'round';
  const d = look.text ? p.w / 2 / r : (p.w - h) / 2 / r;
  const dIn = look.text ? (p.w / 2 - bw) / r : d;
  const below = Math.sin(a) > 0.01; // seats in the lower half read left to right the other way round
  // `span`: half the angle drawn. The words get a longer path than the mark (a quarter turn each way),
  // centred on the seat, so they're never cut off at its ends.
  const path = (rad: number, span = d) => {
    const [a0, a1] = below ? [a + span, a - span] : [a - span, a + span];
    const pt = (t: number) => `${(C + rad * Math.cos(t)).toFixed(2)} ${(C + rad * Math.sin(t)).toFixed(2)}`;
    return `M ${pt(a0)} A ${rad} ${rad} 0 0 ${below ? 0 : 1} ${pt(a1)}`;
  };
  // A touch smaller than elsewhere: a round table's marks are shorter, and the words need room at the ends.
  const fs = 8 * (p.k ?? 1);
  const id = `chair-arc${useId().replace(/:/g, '')}`;
  return (
    <svg aria-hidden={look.text ? undefined : true} style={{ position: 'absolute', left: p.l + arc.ox - C, top: p.t + arc.oy - C, width: 2 * C, height: 2 * C, overflow: 'visible', pointerEvents: 'none' }}>
      <path d={path(r)} fill="none" stroke={bc} strokeWidth={h} strokeLinecap={cap} />
      <path d={path(r, dIn)} fill="none" stroke={look.bg} strokeWidth={h - 2 * bw} strokeLinecap={cap} />
      {look.text && (
        <>
          <path id={id} d={path(below ? r + 0.35 * fs : r - 0.35 * fs, Math.PI / 2)} fill="none" />
          <text fill={look.color} style={{ fontSize: fs, fontWeight: 700, fontFamily: 'inherit' }}>
            <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
              {look.text}
            </textPath>
          </text>
        </>
      )}
    </svg>
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
        <ChairPill key={i} p={p} />
      ))}
      {room.mugs.map((m, i) => (
        <MugMarker key={i} m={m} />
      ))}
      {room.changes.map((c, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: c.l, top: c.t, width: c.w, height: c.h, transform: `rotate(${c.ang}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}
        >
          {c.rows.map((row, k) => (
            <div key={k} style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
              {row.map((it, j) => (
                <Chip key={j} c={it} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Every pill in the key is one size, like the sheet's: 52 × 16 px, 9.5 px bold. */
const KEY_W = 52;
const KEY_H = 16;
const keyPill = (look: { bg: string; border: string; color?: string }, text?: string, h = KEY_H, radius = h / 2) => (
  <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width: KEY_W, height: h, borderRadius: radius, background: look.bg, border: look.border, color: look.color ?? '#111827', fontSize: 9.5, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>
    {text}
  </span>
);
const chairKey = (c: Chair) => keyPill(CHAIR_PILL[c], CHAIR_PILL[c].text, CHAIR_PILL[c].text ? KEY_H : 8, CHAIR_PILL[c].text ? WORD_R : undefined);
const dotKey = <span style={{ flex: 'none', display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: NO_MUG.bg, border: '1px solid #111827', boxSizing: 'border-box' }} />;
const creamerKey = <span style={{ flex: 'none', display: 'inline-block', width: 26, height: 14, borderRadius: 4, boxSizing: 'border-box', background: '#EDE9FE', border: '1.5px solid #6D28D9' }} />;
const cupKey = (
  <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 3, height: 14, padding: '0 6px 0 2px', background: '#111827', color: '#FFFFFF', borderRadius: 2, fontSize: 8, fontWeight: 700, letterSpacing: '.04em' }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 10, height: 10, background: '#86EFAC', color: '#111827', borderRadius: 1.5, fontSize: 9, fontWeight: 900 }}>+</span>
    JUICE
  </span>
);

/**
 * The setup sheet's key, grouped by what each mark is about: chairs (the table edge), the table, the place setting.
 * `vertical` stacks the groups (View puts it beside the drawing), with every description lined up after
 * a column of marks; otherwise the groups sit side by side under the drawing, each on one line, and wrap
 * whole when the page is narrow. `supper`: Supper's sheet adds cups on a band instead of +Glass chips.
 */
export function SetupLegend({ vertical = false, supper = false }: { vertical?: boolean; supper?: boolean }) {
  const groups: { head: string; items: [ReactNode, string][] }[] = [
    { head: 'Chairs', items: [[chairKey('arm'), CHAIR_LABEL.arm], [chairKey('no_arm'), CHAIR_LABEL.no_arm], [chairKey('none'), 'Remove chair']] },
    { head: 'Table', items: [[dotKey, 'Remove mug'], [creamerKey, 'Add creamer tray']] },
    { head: 'Place setting', items: [supper ? [cupKey, 'Add cup'] : [keyPill({ bg: '#86EFAC', border: '1px solid #111827' }, '+Glass'), 'Add drinkware'], [keyPill({ bg: EXTRA_BG, border: '1px solid #111827' }, '+Extra'), 'Add extras']] },
  ];
  return (
    <div data-sheet-legend style={{ marginTop: vertical ? 0 : 12, display: 'flex', flexDirection: vertical ? 'column' : 'row', flexWrap: vertical ? undefined : 'wrap', gap: vertical ? 0 : 8, width: vertical ? 'max-content' : undefined, fontSize: 12, color: '#111827', ...(vertical ? { border: '1px solid #D1D5DB', borderRadius: 8, background: '#FFFFFF', overflow: 'hidden' } : {}) }}>
      {groups.map((g, i) => (
        <div key={g.head} style={vertical ? { padding: '8px 14px 10px', borderTop: i ? '1px solid #E5E7EB' : undefined } : { padding: '6px 12px 7px', border: '1px solid #D1D5DB', borderRadius: 8, background: '#FFFFFF' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#6B7280', marginBottom: 5 }}>{g.head}</div>
          <div style={vertical ? { display: 'grid', gridTemplateColumns: `${KEY_W}px max-content`, alignItems: 'center', gap: '6px 8px' } : { display: 'flex', alignItems: 'center', gap: 14 }}>
            {g.items.map(([mark, text]) =>
              vertical ? (
                <Fragment key={text}>
                  <span style={{ display: 'flex', justifyContent: 'center' }}>{mark}</span>
                  <span>{text}</span>
                </Fragment>
              ) : (
                <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                  {mark}
                  {text}
                </span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Page height a server drawing gives up for its notes. */
const roomTrim = (b: PageData['body']) => (b.kind === 'server' && b.notesShown ? Math.round((b.room.h + 2) * (1 - b.roomScale)) : 0);

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
          style={{ height: b.kind === 'setup' || !b.notesShown ? page.h - PAGE_CHROME : page.h - 124 - roomTrim(b), boxSizing: 'border-box', paddingTop: 12, display: 'grid', gridTemplateColumns: 'max-content', gap: '12px 20px', alignContent: b.kind === 'setup' ? 'start' : 'center', justifyContent: 'center' }}
        >
          <div data-sheet-room>
            {b.kind === 'server' ? (
              // Smaller when a long notes list needs the room; larger on Breakfast's 11 × 17 setup sheet.
              <div style={{ width: (b.room.w + 2) * b.roomScale, height: (b.room.h + 2) * b.roomScale }}>
                <div style={{ zoom: b.roomScale !== 1 ? b.roomScale : undefined }}>
                  <ServerBody room={b.room} />
                </div>
              </div>
            ) : (
              // Larger when the page has room to spare; smaller when the sections' chips need more width than it has.
              <div style={{ width: (b.room.w + 2) * b.room.scale, height: (b.room.h + 2) * b.room.scale }}>
                <div style={{ zoom: b.room.scale !== 1 ? b.room.scale : undefined }}>
                  <SetupBody room={b.room} />
                </div>
              </div>
            )}
          </div>
          {b.kind === 'setup' && <SetupLegend />}
          {b.kind === 'server' && b.legend && <SetupLegend supper={b.legend === 'supper'} />}
        </div>

      {b.kind === 'server' && b.notesShown && (
        <div style={{ flex: 1, borderTop: '1px solid #E5E7EB', paddingTop: 6, fontSize: 10.5, color: '#4B5563' }}>
          <ServerNotes notes={b.notes} />
        </div>
      )}
    </div>
  );
}

/**
 * A page scaled by `k` inside a box of the scaled size (so layout around it is right). CSS zoom, not a
 * transform: the app's webview draws transform-scaled text at one size and stretches it (blurry),
 * while zoom lays the text out at the size it's shown, so it stays sharp.
 */
export function ScaledPage({ page, k }: { page: PageData; k: number }) {
  return (
    <div style={{ width: Math.round(page.w * k), height: Math.round(page.h * k), margin: '0 auto', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, zoom: k }}>
        <SheetPage page={page} />
      </div>
    </div>
  );
}
