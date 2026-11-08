import { useState } from 'react';
import { fitScale } from '../../sheets/model';
import { printPages } from '../../sheets/print';
import { ScaledPage } from '../../sheets/SheetPage';
import { useSheets } from '../../sheets/useSheets';
import { PrintIcon } from '../../shell/icons';
import { useWidth } from '../../ui/useWidth';
import type { ScreenProps } from '../types';

const Tick = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);

export function PrintScreen({ site, meal, opening }: ScreenProps) {
  const { sheets, page } = useSheets(site, meal, opening);
  // Unticked sheets, by key; everything is ticked by default.
  const [off, setOff] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState(0);
  const [zoom, setZoom] = useState<'fit' | 'full'>('fit');
  const [busy, setBusy] = useState(false);
  const [boxRef, boxW] = useWidth<HTMLDivElement>();

  const chosen = sheets.filter((s) => !off.has(s.key));
  const idx = Math.min(pick, Math.max(chosen.length - 1, 0));
  const current = chosen[idx];
  const pg = current ? page(current, chosen) : null;

  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
    setPick(0);
  };

  const print = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      await printPages(chosen.map((s) => page(s, chosen)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row-wrap">
      <aside className="card" style={{ flex: '1 1 280px', maxWidth: 340, padding: 18 }}>
        <h1 className="h1" style={{ marginBottom: 4 }}>Print</h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#4B5563' }}>
          {site.name} · {meal}. Pick the pages to print.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
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
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{chosen.length === 1 ? '1 page' : `${chosen.length} pages`}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn primary" onClick={print} disabled={!chosen.length || busy}>
            <PrintIcon size={17} />
            Print
          </button>
          {/* The system print dialog offers "Save as PDF" as a printer. */}
          <button type="button" className="btn" onClick={print} disabled={!chosen.length || busy} title="Opens the print dialog; choose Save as PDF there">
            Save as PDF
          </button>
        </div>
      </aside>

      <section className="card" style={{ flex: '999 1 560px', minWidth: 0, padding: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="lbl" style={{ marginRight: 4 }}>Preview</span>
          {chosen.map((s, i) => (
            <button key={s.key} type="button" className={i === idx ? 'thumb on' : 'thumb'} onClick={() => setPick(i)}>
              {s.tab}
            </button>
          ))}
          <div style={{ flex: '1 1 10px' }} />
          <div className="segwrap" role="group" aria-label="Zoom">
            <button type="button" className={zoom === 'fit' ? 'seg on' : 'seg'} aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>
              Fit
            </button>
            <button type="button" className={zoom === 'full' ? 'seg on' : 'seg'} aria-pressed={zoom === 'full'} onClick={() => setZoom('full')}>
              100%
            </button>
          </div>
        </div>
        {!pg ? (
          <p style={{ margin: 0, padding: 40, textAlign: 'center', fontSize: 14, color: '#4B5563' }}>Tick at least one page on the left to see a preview.</p>
        ) : (
          <div ref={boxRef} style={{ overflow: 'auto', background: '#E5E7EB', borderRadius: 8, padding: 16 }}>
            <ScaledPage page={pg} k={zoom === 'full' ? 1 : fitScale(boxW || 772, pg.w)} />
          </div>
        )}
      </section>
    </div>
  );
}
