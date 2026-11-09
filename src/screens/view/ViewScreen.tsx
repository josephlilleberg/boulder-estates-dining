import { useLayoutEffect, useRef, useState } from 'react';
import { DrawingView } from '../../sheets/DrawingView';
import { fitPage } from '../../sheets/model';
import { ScaledPage, SetupLegend } from '../../sheets/SheetPage';
import { useSheets } from '../../sheets/useSheets';
import { Segmented } from '../../shell/Segmented';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';

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
  const { sheets, page } = useSheets(site, meal, opening);
  const [picked, setPicked] = useState('setup');
  const [zoom, setZoomState] = useState<Zoom>(savedZoom);
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
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
          View · {meal}
        </h1>
        <Segmented label="Sheet" role="tablist" options={sheets.map((s) => ({ value: s.key, label: s.label }))} value={current.key} onChange={setPicked} style={{ flexWrap: 'wrap' }} />
        <div style={{ flex: '1 1 0' }} />
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
        {keyKind === 'below' && (
          <div ref={keyRef} style={{ display: 'flex', justifyContent: 'center', paddingTop: 6, fontSize: 12, color: '#374151' }}>
            {pg.legendText}
          </div>
        )}
      </div>
    </section>
  );
}
