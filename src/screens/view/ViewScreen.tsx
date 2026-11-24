import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DrawingView } from '../../sheets/DrawingView';
import { fitPage } from '../../sheets/model';
import { printPages } from '../../sheets/print';
import { PrintIcon } from '../../shell/icons';
import { ScaledPage, ServerNotes, SetupLegend } from '../../sheets/SheetPage';
import { sheetDay, useSheets } from '../../sheets/useSheets';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';

/** Ctrl/⌘+P sends this so the Sheets screen opens its print panel. */
export const OPEN_PRINT = 'be-open-print';

type Zoom = 'drawing' | 'page';
const ZOOM_KEY = 'be-view-zoom-2';

const savedZoom = (): Zoom => {
  try {
    return localStorage.getItem(ZOOM_KEY) === 'page' ? 'page' : 'drawing';
  } catch {
    return 'drawing';
  }
};

export function ViewScreen({ site, meal, opening }: ScreenProps) {
  // The day the sheets are for: today, or one of the next six days. Anyone gone that weekday prints empty.
  const [dayOffset, setDayOffset] = useState(0);
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
  const { sheets, page } = useSheets(site, meal, opening, day);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const open = () => setPrinting(true);
    window.addEventListener(OPEN_PRINT, open);
    return () => window.removeEventListener(OPEN_PRINT, open);
  }, []);
  const [picked, setPicked] = useState('setup');
  const [zoom, setZoomState] = useState<Zoom>(savedZoom);
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
  const servers = sheets.filter((s) => s.kind === 'server');
  // The sheet box runs to the bottom of the window (card + page padding below it).
  const [boxRef, box] = useFitBox<HTMLDivElement>(28);
  const pg = page(current);
  const PAD = 6;
  // Drawing view crops away the page's key, so it's shown at full size: the chair key beside
  // the setup drawing (width is what a wide window has spare), a line under a server sheet.
  const keyRef = useRef<HTMLDivElement>(null);
  const [keySize, setKeySize] = useState({ w: 0, h: 0 });
  const keyKind = zoom === 'drawing' ? (pg.body.kind === 'setup' ? 'side' : pg.body.kind === 'server' ? 'below' : null) : null;
  useLayoutEffect(() => {
    const el = keyRef.current;
    setKeySize(keyKind && el ? { w: keyKind === 'side' ? el.offsetWidth + 10 : 0, h: keyKind === 'below' ? el.offsetHeight : 0 } : { w: 0, h: 0 });
  }, [keyKind, box.w]);

  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {
      /* remembered for this session only */
    }
  };

  return (
    <section className="card" style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 8 }}>
        <h1 className="h1" style={{ marginRight: 4 }}>
          Sheets · {meal}
        </h1>
        {/* One row: Setup · Server 1 2 3, then how to show it. The server
            sheets share one "Server" label so the section numbers read like Seating's. */}
        <div className="segwrap" role="tablist" aria-label="Sheet" style={{ alignItems: 'center' }}>
          {sheets.map((s, i) => {
            const on = s.key === current.key;
            const many = servers.length > 1;
            const firstServer = s.kind === 'server' && sheets[i - 1]?.kind !== 'server';
            return (
              <Fragment key={s.key}>
                {firstServer && many && (
                  <span aria-hidden="true" style={{ padding: '0 4px 0 10px', fontSize: 12.5, fontWeight: 600, color: '#6B7280' }}>
                    Server
                  </span>
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={s.label}
                  title={s.label}
                  className={on ? 'seg on' : 'seg'}
                  style={s.kind === 'server' && many ? { minWidth: 36, padding: '0 10px' } : undefined}
                  onClick={() => setPicked(s.key)}
                >
                  {s.kind === 'server' ? (many ? s.section : 'Server') : s.label}
                </button>
                {s.kind === 'server' && many && sheets[i + 1]?.kind !== 'server' && <span aria-hidden="true" style={{ width: 8 }} />}
              </Fragment>
            );
          })}
        </div>
        <div style={{ flex: '1 1 0' }} />
        <select
          aria-label="Sheets for"
          title="The day the sheets are for: anyone gone that day prints as an empty seat"
          value={dayOffset}
          onChange={(ev) => setDayOffset(Number(ev.target.value))}
          style={{ height: 36, padding: '0 10px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', color: '#111827', background: '#FFFFFF' }}
        >
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
            return (
              <option key={i} value={i}>
                {i === 0 ? `Today · ${sheetDay(d)}` : i === 1 ? `Tomorrow · ${sheetDay(d)}` : sheetDay(d)}
              </option>
            );
          })}
        </select>
        <div className="segwrap" role="group" aria-label="Zoom">
          {(
            [
              ['drawing', 'Drawing'],
              ['page', 'Whole page'],
            ] as const
          ).map(([z, label]) => (
            <button key={z} type="button" className={zoom === z ? 'seg on' : 'seg'} aria-pressed={zoom === z} onClick={() => setZoom(z)} title={z === 'drawing' ? 'Just the tables and labels, as large as fits' : 'The full sheet as it prints'}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn primary" aria-haspopup="dialog" aria-expanded={printing} onClick={() => setPrinting(!printing)}>
            <PrintIcon size={17} />
            Print…
          </button>
          {printing && <PrintPanel sheets={sheets} page={page} onClose={() => setPrinting(false)} />}
        </div>
      </div>
      <div ref={boxRef} style={{ height: box.h || undefined, overflow: 'auto', background: '#E5E7EB', borderRadius: 8, padding: PAD, boxSizing: 'border-box' }}>
        {box.w > 0 &&
          (zoom === 'drawing' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <DrawingView page={pg} w={box.w - keySize.w} h={box.h - 2 * PAD - keySize.h} />
              </div>
              {keyKind === 'side' && (
                <div ref={keyRef} style={{ flex: 'none' }}>
                  <SetupLegend vertical />
                </div>
              )}
            </div>
          ) : (
            <ScaledPage page={pg} k={fitPage(box.w, box.h - 2 * PAD, pg.w, pg.h)} />
          ))}
        {/* Drawing view crops to the tables, so a server sheet's notes go underneath. */}
        {keyKind === 'below' && pg.body.kind === 'server' && (
          <div ref={keyRef} style={{ paddingTop: 8, maxWidth: 1000, margin: '0 auto' }}>
            {pg.body.legend && (
              <div style={{ marginBottom: 8 }}>
                <SetupLegend supper={pg.body.legend === 'supper'} />
              </div>
            )}
            {pg.body.notesShown && <ServerNotes notes={pg.body.notes} />}
          </div>
        )}
      </div>
    </section>
  );
}

const Tick = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

type Sheets = ReturnType<typeof useSheets>;

/** Pick the pages (all ticked to start) and print them; the print dialog also offers Save as PDF. */
function PrintPanel({ sheets, page, onClose }: { sheets: Sheets['sheets']; page: Sheets['page']; onClose: () => void }) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const chosen = sheets.filter((s) => !off.has(s.key));
  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
  };
  const print = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      await printPages(chosen.map(page));
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
      <div role="dialog" aria-label="Print" style={{ position: 'absolute', top: 46, right: 0, zIndex: 21, width: 320, padding: 12, background: '#FFFFFF', border: '1px solid var(--card-border)', borderRadius: 12, boxShadow: '0 10px 30px rgba(17,24,39,.16)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {sheets.map((s) => {
            const on = !off.has(s.key);
            return (
              <button key={s.key} type="button" className="check" aria-pressed={on} onClick={() => toggle(s.key)}>
                <span className={on ? 'box on' : 'box'}>
                  <Tick />
                </span>
                <span style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{s.printLabel}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>{s.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className="btn primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void print()} disabled={!chosen.length || busy} title="Opens the print dialog; choose Save as PDF there for a file">
          <PrintIcon size={17} />
          Print {chosen.length === 1 ? '1 page' : `${chosen.length} pages`}
        </button>
      </div>
    </>
  );
}
