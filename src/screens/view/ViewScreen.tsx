import { Fragment, useEffect, useState } from 'react';
import { fitPage, PAGE } from '../../sheets/model';
import { PrintDialog } from '../../sheets/PrintDialog';
import { PrintIcon } from '../../shell/icons';
import { ScaledPage, SheetPage } from '../../sheets/SheetPage';
import { sheetDay, useSheets } from '../../sheets/useSheets';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';

/** Ctrl/⌘+P sends this so the Sheets screen opens its print panel. */
export const OPEN_PRINT = 'be-open-print';

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
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
  const servers = sheets.filter((s) => s.kind === 'server');
  // The sheet box runs to the bottom of the window (card + page padding below it).
  const [boxRef, box] = useFitBox<HTMLDivElement>(28);
  const pg = page(current);
  const PAD = 6;
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
        {/* The setup sheet is for every day (it marks who's gone), so the day only applies to the others. */}
        {current.kind !== 'setup' && (
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
        )}
        <button type="button" className="btn primary" aria-haspopup="dialog" onClick={() => setPrinting(true)}>
          <PrintIcon size={17} />
          Print…
        </button>
        {printing && (
          <PrintDialog
            title="Print"
            subtitle={`${meal} · server sheets for ${sheetDay(day)}`}
            items={sheets.map((s) => ({ key: s.key, label: s.printLabel, sub: s.sub, ...PAGE[s.paper], render: () => <SheetPage page={page(s)} shadow={false} /> }))}
            onClose={() => setPrinting(false)}
          />
        )}
      </div>
      <div ref={boxRef} style={{ height: box.h || undefined, overflow: 'auto', background: '#E5E7EB', borderRadius: 8, padding: PAD, boxSizing: 'border-box' }}>
        {box.w > 0 && <ScaledPage page={pg} k={fitPage(box.w, box.h - 2 * PAD, pg.w, pg.h)} />}
      </div>
    </section>
  );
}
