import { useMemo, useState } from 'react';
import { printOn } from '../../sheets/print';
import { PAGE } from '../../sheets/model';
import { useStore } from '../../state/store';
import { useFitBox } from '../../ui/useFitBox';
import type { ScreenProps } from '../types';
import { MealPlanSheet, ROWS_PER_PAGE } from './MealPlanSheet';
import { addDays, chunk, planRows, weekDays, weekLabels, weekStart } from './plan';

/** The weekly meal plan sheet, to print and mark by hand. Who's on the plan is set on each resident's card. */
export function MealPlanScreen({ site }: ScreenProps) {
  const residents = useStore((s) => s.data.residents);
  const [start, setStart] = useState(() => weekStart(new Date()));
  const [busy, setBusy] = useState(false);
  const [boxRef, box] = useFitBox<HTMLDivElement>(28);

  const meals = site.meals.map((m) => m.meal);
  const rows = useMemo(() => planRows(residents, site), [residents, site]);
  const pages = chunk(rows, ROWS_PER_PAGE);
  const { month, week } = weekLabels(start);
  const days = weekDays(start);
  const thisWeek = weekStart(new Date()).getTime() === start.getTime();

  const sheets = (shadow: boolean) =>
    pages.map((p, i) => <MealPlanSheet key={i} title={`${site.name} Meal Plan`} month={month} week={week} days={days} meals={meals} rows={p} page={i + 1} pages={pages.length} shadow={shadow} />);

  const print = async () => {
    setBusy(true);
    try {
      await printOn('letter', <>{sheets(false)}</>);
    } finally {
      setBusy(false);
    }
  };

  const { w, h } = PAGE.letter;
  const k = box.w ? Math.min(1, box.w / w) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          Meal plan <span style={{ fontSize: 14, fontWeight: 500, color: '#4B5563' }}>{rows.length} on the plan</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
            ‹
          </button>
          <span style={{ minWidth: 190, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>Week of {week}</span>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
            ›
          </button>
          {!thisWeek && (
            <button type="button" className="linkbtn" style={{ marginLeft: 6 }} onClick={() => setStart(weekStart(new Date()))}>
              This week
            </button>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#4B5563' }}>Turn the meal plan on or off on each resident’s card</span>
        <button type="button" className="btn primary" onClick={() => void print()} disabled={busy || !rows.length} title="Opens the print dialog; choose Save as PDF there for a file">
          Print{pages.length > 1 ? ` ${pages.length} pages` : ''}
        </button>
      </div>

      <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, paddingBottom: 12 }}>
        {!rows.length ? (
          <p className="card" style={{ margin: 0, padding: 24, fontSize: 14, color: '#4B5563' }}>
            No one is on the meal plan yet. Turn it on from a resident’s card in Residents.
          </p>
        ) : (
          k > 0 &&
          sheets(true).map((s, i) => (
            <div key={i} style={{ width: w * k, height: h * k }}>
              <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: 'top left' }}>{s}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
