import { useState } from 'react';
import { fitPage } from '../../sheets/model';
import { ScaledPage } from '../../sheets/SheetPage';
import { useSheets } from '../../sheets/useSheets';
import { Segmented } from '../../shell/Segmented';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';

type Zoom = 'width' | 'page';
const ZOOM_KEY = 'be-view-zoom';

const savedZoom = (): Zoom => {
  try {
    return localStorage.getItem(ZOOM_KEY) === 'page' ? 'page' : 'width';
  } catch {
    return 'width';
  }
};

/** Fit width fills the box side to side (scrolls down for tall pages), up to 150%. */
export const viewScale = (zoom: Zoom, boxW: number, boxH: number, pageW: number, pageH: number) =>
  zoom === 'page' ? fitPage(boxW, boxH, pageW, pageH) : Math.max(0.1, Math.min(1.5, Math.floor((boxW / pageW) * 100) / 100));

export function ViewScreen({ site, meal, opening }: ScreenProps) {
  const { sheets, page } = useSheets(site, meal, opening);
  const [picked, setPicked] = useState('setup');
  const [zoom, setZoomState] = useState<Zoom>(savedZoom);
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
  // The sheet box runs to the bottom of the window (card + page padding below it) and scrolls inside.
  const [boxRef, box] = useFitBox<HTMLDivElement>(40);
  const pg = page(current);
  const PAD = 12;

  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {
      /* remembered for this session only */
    }
  };

  return (
    <section className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', marginBottom: 10 }}>
        <h1 className="h1" style={{ marginRight: 4 }}>
          View · {meal}
        </h1>
        <Segmented label="Sheet" role="tablist" options={sheets.map((s) => ({ value: s.key, label: s.label }))} value={current.key} onChange={setPicked} style={{ flexWrap: 'wrap' }} />
        <div style={{ flex: '1 1 0' }} />
        <div className="segwrap" role="group" aria-label="Zoom">
          {(
            [
              ['width', 'Fit width'],
              ['page', 'Whole page'],
            ] as const
          ).map(([z, label]) => (
            <button key={z} type="button" className={zoom === z ? 'seg on' : 'seg'} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div ref={boxRef} style={{ height: box.h || undefined, overflow: 'auto', background: '#E5E7EB', borderRadius: 8, padding: PAD, boxSizing: 'border-box' }}>
        {box.w > 0 && <ScaledPage page={pg} k={viewScale(zoom, box.w, box.h - 2 * PAD, pg.w, pg.h)} />}
      </div>
    </section>
  );
}
