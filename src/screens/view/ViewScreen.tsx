import { useState } from 'react';
import { fitScale } from '../../sheets/model';
import { ScaledPage } from '../../sheets/SheetPage';
import { useSheets } from '../../sheets/useSheets';
import { Segmented } from '../../shell/Segmented';
import { useWidth } from '../../ui/useWidth';
import type { ScreenProps } from '../types';

export function ViewScreen({ site, meal, opening }: ScreenProps) {
  const { sheets, page } = useSheets(site, meal, opening);
  const [picked, setPicked] = useState('setup');
  const current = sheets.find((s) => s.key === picked) ?? sheets[0]!;
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
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
        {boxW > 0 && <ScaledPage page={pg} k={fitScale(boxW || 1200, pg.w)} />}
      </div>
    </section>
  );
}
