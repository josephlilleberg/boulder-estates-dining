import { useState } from 'react';
import { fitPage } from '../../sheets/model';
import { ScaledPage } from '../../sheets/SheetPage';
import { useSheets } from '../../sheets/useSheets';
import { Segmented } from '../../shell/Segmented';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';

export function ViewScreen({ site, meal, opening }: ScreenProps) {
  const { sheets, page } = useSheets(site, meal, opening);
  const [picked, setPicked] = useState('setup');
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
  // Grey box padding (16 top + 16 bottom) + card and page padding below it.
  const [boxRef, box] = useFitBox<HTMLDivElement>(32 + 40);
  const pg = page(current);

  return (
    <section className="card" style={{ padding: '16px 14px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h1 className="h1">View</h1>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#4B5563' }}>
        {site.name} · {meal}. Pick a sheet to see it the way it prints.
      </p>
      <Segmented
        label="Sheet"
        role="tablist"
        options={sheets.map((s) => ({ value: s.key, label: s.label }))}
        value={current.key}
        onChange={setPicked}
        style={{ marginBottom: 12, flexWrap: 'wrap' }}
      />
      <div ref={boxRef} style={{ background: '#E5E7EB', borderRadius: 8, padding: 16 }}>
        {box.w > 0 && <ScaledPage page={pg} k={fitPage(box.w, box.h, pg.w, pg.h)} />}
      </div>
    </section>
  );
}
