import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import type { ScreenProps } from '../types';
import { NameDialog } from './dialogs';
import { buildList, type SortKey } from './list';
import { ResidentCard } from './ResidentCard';

// Both panels fill the window height and scroll inside (mockup: max(640px, 100vh - 160px)).
const PANEL_HEIGHT = 'max(640px, calc(100vh - 160px))';

export function ResidentsScreen(props: ScreenProps) {
  const { site, residentId, onResident } = props;
  const residents = useStore((s) => s.data.residents);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('last');
  const [archivedView, setArchivedView] = useState(false);
  const [adding, setAdding] = useState(false);

  const atSite = useMemo(() => residents.filter((r) => r.siteId === site.id), [residents, site.id]);
  const pool = useMemo(() => atSite.filter((r) => r.archived === archivedView), [atSite, archivedView]);
  const archivedCount = atSite.length - atSite.filter((r) => !r.archived).length;
  const { groups, ids } = useMemo(() => buildList(pool, q, sort), [pool, q, sort]);

  // Mockup: keep the chosen resident if they belong here, otherwise show the first in the list.
  const selected = pool.find((r) => r.id === residentId) ?? pool.find((r) => r.id === ids[0]) ?? null;
  const count = ids.length === pool.length ? String(pool.length) : `${ids.length} of ${pool.length}`;

  const toggleArchived = () => {
    setArchivedView((v) => !v);
    setQ('');
    onResident(null);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
      <section className="card" style={{ flex: '1 1 300px', maxWidth: 380, height: PANEL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              {archivedView ? 'Archived' : 'Residents'} <span style={{ fontSize: 14, fontWeight: 500, color: '#4B5563' }}>{count}</span>
            </h1>
            {!archivedView && (
              <button type="button" className="btn sm primary" onClick={() => setAdding(true)}>
                + Add
              </button>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              id="rsearch"
              type="search"
              aria-label="Search residents"
              placeholder="Search by name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', height: 40, padding: '0 12px 0 34px', border: 0, background: '#F1F3F5', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', color: '#111827' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: '#4B5563' }}>Sort by</span>
            <div className="segwrap" role="group" aria-label="Sort residents by">
              {(
                [
                  ['last', 'Last name'],
                  ['first', 'First name'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} type="button" className={sort === k ? 'seg on' : 'seg'} aria-pressed={sort === k} onClick={() => setSort(k)} style={{ height: 28, fontSize: 12 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groups.map((g) => (
            <div key={g.letter}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '4px 16px', background: '#F7F8FA', borderBottom: '1px solid #EEF0F3', fontSize: 12, fontWeight: 700, color: '#4B5563' }}>{g.letter}</div>
              {g.rows.map((r) => (
                <button key={r.id} type="button" className={selected?.id === r.id ? 'rrow on' : 'rrow'} aria-current={selected?.id === r.id || undefined} onClick={() => onResident(r.id)}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                </button>
              ))}
            </div>
          ))}
          {ids.length === 0 && (
            <p style={{ margin: 0, padding: '24px 16px', fontSize: 14, color: '#4B5563', textAlign: 'center' }}>
              {pool.length > 0 ? 'No residents match.' : archivedView ? 'No one is archived.' : archivedCount > 0 ? 'Everyone is archived.' : 'No residents yet. Import a residents file in Settings, or use + Add.'}
            </p>
          )}
        </div>

        {/* Not in the mockup: the way back to archived residents (nothing is ever deleted). */}
        {(archivedCount > 0 || archivedView) && (
          <div className="list-foot">
            <button type="button" className="linkbtn" onClick={toggleArchived}>
              {archivedView ? '← Back to residents' : `Archived residents (${archivedCount})`}
            </button>
          </div>
        )}
      </section>

      {selected && <ResidentCard key={selected.id} resident={selected} height={PANEL_HEIGHT} {...props} />}

      {adding && (
        <NameDialog
          mode="add"
          site={site}
          // New residents start at Dinner, whatever meal is showing.
          defaultMeal={props.site.meals.some((m) => m.meal === 'Dinner') ? 'Dinner' : props.meal}
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setQ('');
            onResident(id);
          }}
        />
      )}
    </div>
  );
}
