import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { seatLabel } from '../../domain/labels';
import { fullName, type Resident } from '../../domain/model';
import { seatCount } from '../../domain/tables';
import { Segmented } from '../../shell/Segmented';
import { act } from '../../state/act';
import { clearSeat, seatResident, type SeatRef } from '../../state/actions';
import { useStore } from '../../state/store';
import { useWidth } from '../../ui/useWidth';
import type { ScreenProps } from '../types';
import { cropOf, detailFacts, detailRows, mealRoster, parseSeatKey, pickerList, pickerPosition, seatingScale, seatKey, seatRoom, shortWhere, type SeatKey, type SeatLabel } from './model';
import { SeatRoomView } from './SeatRoomView';

function useWindowHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return h;
}

export function SeatingScreen({ site, meal, opening, onResident, navigate }: ScreenProps) {
  const data = useStore((s) => s.data);
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>();
  const winH = useWindowHeight();

  const tabs = opening.sections;
  const [sectionPick, setSection] = useState(tabs[0]?.section ?? 1);
  // Keep the pick valid when the meal changes (e.g. Dinner S3 → Breakfast).
  const section = tabs.some((t) => t.section === sectionPick) ? sectionPick : (tabs[0]?.section ?? 1);

  // Selection, pop-up and "placing" all belong to one meal; switching meals drops them.
  const [ui, setUi] = useState<{ meal: string; sel: SeatKey | null; pop: SeatKey | null; pick: string | null }>({ meal, sel: null, pop: null, pick: null });
  const cur = ui.meal === meal ? ui : { meal, sel: null, pop: null, pick: null };
  const setCur = (p: Partial<typeof cur>) => setUi({ ...cur, ...p, meal });
  const [popQ, setPopQ] = useState('');

  const layoutId = data.layouts.find((l) => l.siteId === site.id && l.active)?.id;
  const openTables = useMemo(
    () => data.tables.filter((t) => t.layoutId === layoutId && tabs.some((o) => o.section === t.section)),
    [data.tables, layoutId, tabs],
  );
  const tables = openTables.filter((t) => t.section === section);
  const roster = useMemo(() => mealRoster(data.residents, data.seating, site.id, meal), [data.residents, data.seating, site.id, meal]);

  const crop = cropOf(tables);
  const sc = seatingScale(crop, wrapW, winH);
  const room = seatRoom(tables, sc, crop, (k) => roster.bySeat.get(k) ?? null, !!cur.pick);

  const totalSeats = openTables.reduce((n, t) => n + seatCount(t.shape), 0);
  const seatedAt = (ts: typeof openTables) => ts.reduce((n, t) => n + Array.from({ length: seatCount(t.shape) }, (_, i) => seatKey(t.id, i)).filter((k) => roster.bySeat.has(k)).length, 0);
  const nSeated = seatedAt(openTables);
  const seatedIn = (s: number) => seatedAt(openTables.filter((t) => t.section === s));

  const ref = (k: SeatKey): SeatRef => ({ siteId: site.id, meal, ...parseSeatKey(k) });
  const where = (k: SeatKey) => seatLabel(site, meal, parseSeatKey(k), data.tables);
  const residentById = (id: string) => data.residents.find((r) => r.id === id);

  /** Seat, move or swap: one undo step, named for what happened. */
  const seat = async (target: SeatKey, residentId: string) => {
    const r = residentById(residentId);
    if (!r) return;
    const other = roster.bySeat.get(target);
    const from = roster.seatOf.get(residentId);
    if (other?.id === residentId) return setCur({ pick: null, pop: null, sel: target });
    const label = other && from ? `Swap ${fullName(r)} and ${fullName(other)}` : from ? `Move ${fullName(r)}` : `Seat ${fullName(r)}`;
    if (await act(label, seatResident(ref(target), residentId))) setUi({ meal, sel: target, pop: null, pick: null });
  };

  const onSeatClick = (lab: SeatLabel) => {
    if (cur.pick) return void seat(lab.key, cur.pick);
    if (lab.resident) return setCur({ sel: lab.key, pop: null });
    setPopQ('');
    setCur({ pop: lab.key, sel: null });
  };

  // Esc cancels "placing someone".
  useEffect(() => {
    if (!cur.pick) return;
    const on = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setUi((u) => ({ ...u, pick: null }));
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [cur.pick]);

  // ---- Pop-up ----
  const popLab = cur.pop ? room.labels.find((l) => l.key === cur.pop && !l.resident) : undefined;
  const picker = popLab ? pickerList(roster, popQ) : null;
  const popList: Resident[] = picker ? [...picker.waiting, ...picker.others] : [];
  const searching = popQ.trim() !== '';
  const popPos = popLab && picker ? pickerPosition(popLab, room, popList.length, searching, picker.waitingTotal > 5) : null;
  const shortSeat = (r: Resident) => {
    const s = roster.seatOf.get(r.id);
    const t = s && data.tables.find((x) => x.id === s.tableId);
    const label = t && tabs.find((o) => o.section === t.section)?.label;
    return t && label ? shortWhere(label, t.number) : '';
  };
  const popKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setCur({ pop: null });
    if (e.key === 'Enter' && popList[0] && cur.pop) void seat(cur.pop, popList[0].id);
  };

  // ---- Seat details ----
  const selRes = cur.sel ? roster.bySeat.get(cur.sel) : undefined;
  const pickRes = cur.pick ? residentById(cur.pick) : undefined;
  const pickFrom = pickRes && roster.seatOf.get(pickRes.id);
  const popTitle = popLab ? where(popLab.key).replace(/^.*? · (Table)/, '$1') : '';
  const rows = selRes ? detailRows(selRes, meal, data.beverages) : [];
  const facts = selRes ? detailFacts(selRes, meal) : [];

  return (
    <div className="row-wrap">
      <section className="card" style={{ flex: '999 1 720px', minWidth: 0, padding: '16px 14px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12 }}>
          <h1 className="h1">Seating · {meal}</h1>
          <span style={{ fontSize: 13, color: '#4B5563' }}>
            {nSeated} seated · {roster.waiting.length} not seated · {totalSeats - nSeated} empty seats
          </span>
        </div>
        <p className="sub">Click a + to seat someone. Drag a name onto another seat to move or swap.</p>
        {pickRes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 14, color: '#1E3A8A' }}>
            <span style={{ flex: 1 }}>
              Placing <strong>{fullName(pickRes)}</strong>. Click any seat.
            </span>
            <button type="button" className="btn sm" onClick={() => setCur({ pick: null })}>
              Cancel
            </button>
          </div>
        )}
        <Segmented
          label="Section"
          role="tablist"
          options={tabs.map((t) => ({ value: String(t.section), label: `${t.label} · ${seatedIn(t.section)}` }))}
          value={String(section)}
          onChange={(v) => {
            setSection(Number(v));
            setCur({ sel: null, pop: null });
          }}
          style={{ marginBottom: 10 }}
        />
        <div ref={wrapRef} style={{ overflowX: 'auto', padding: 2 }}>
          {wrapW > 0 && (
            <SeatRoomView room={room} selectedKey={cur.sel ?? (pickFrom ? seatKey(pickFrom.tableId, pickFrom.seat) : null)} picking={!!cur.pick} onSeatClick={onSeatClick} onDrop={(rid, k) => void seat(k, rid)}>
              {popLab && popPos && picker && (
                <>
                  <div aria-hidden="true" onClick={() => setCur({ pop: null })} style={{ position: 'absolute', inset: 0, zIndex: 4 }} />
                  <div role="dialog" aria-label={`Who sits at ${popTitle}?`} className="seatpop" style={{ left: popPos.x, top: popPos.y, width: popPos.w }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 8px 4px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{popTitle}</span>
                      <button type="button" className="iconbtn" style={{ width: 26, height: 26 }} aria-label="Close" onClick={() => setCur({ pop: null })}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                    <div className="popsearch">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flex: 'none' }}>
                        <circle cx="11" cy="11" r="6.5" />
                        <path d="M16 16l4 4" />
                      </svg>
                      <input type="text" placeholder="Who sits here?" aria-label="Search residents" autoFocus value={popQ} onChange={(e) => setPopQ(e.target.value)} onKeyDown={popKey} />
                    </div>
                    {picker.waiting.length > 0 && (
                      <div>
                        {searching && picker.others.length > 0 && <div className="pophead">Waiting</div>}
                        {picker.waiting.map((r, i) => (
                          <PopRow key={r.id} name={fullName(r)} where="" first={i === 0} onClick={() => void seat(popLab.key, r.id)} />
                        ))}
                      </div>
                    )}
                    {picker.others.length > 0 && (
                      <div>
                        <div className="pophead">Seated elsewhere</div>
                        {picker.others.map((r, i) => (
                          <PopRow key={r.id} name={fullName(r)} where={shortSeat(r)} first={!picker.waiting.length && i === 0} onClick={() => void seat(popLab.key, r.id)} />
                        ))}
                      </div>
                    )}
                    {popList.length === 0 && <p className="popnote">{searching ? 'No one matches.' : 'Everyone is seated. Type a name to move someone here.'}</p>}
                    {!searching && picker.waitingTotal > 5 && <p className="popnote">{picker.waitingTotal - 5} more waiting. Type a name.</p>}
                  </div>
                </>
              )}
            </SeatRoomView>
          )}
        </div>
      </section>

      <aside style={{ flex: '1 1 280px', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section className="card" style={{ padding: 18 }}>
          {!selRes || !cur.sel ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Seat details</div>
              <p style={{ margin: 0, fontSize: 13, color: '#6B7280', lineHeight: 1.5 }}>Click a name to see their drinks for {meal} and any notes.</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{where(cur.sel)}</div>
              <h2 style={{ margin: '2px 0 14px', fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: '-.01em' }}>{fullName(selRes)}</h2>
              <div className="sdlbl">{meal}</div>
              <div className="sdlist">
                {rows.map((d, i) => (
                  <div key={i} className="sdrow">
                    <span className="sddot" style={{ background: d.dot, borderColor: 'rgba(17,24,39,.35)' }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{d.name}</span>
                    <span className="sdmeta">{d.meta}</span>
                  </div>
                ))}
                {!rows.length && (
                  <div className="sdrow" style={{ color: '#6B7280' }}>
                    Just the usual glass and mug
                  </div>
                )}
              </div>
              {facts.length > 0 && (
                <div className="sdlist" style={{ marginTop: 12 }}>
                  {facts.map((f) => (
                    <div key={f.label} className="sdrow">
                      <span style={{ flex: 1 }}>{f.label}</span>
                      <span className="sdmeta" style={{ color: '#111827' }}>
                        {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {selRes.notes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {selRes.notes.map((n) => (
                    <div key={n.id} className="sdnote">
                      {n.text}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 16 }}>
                <button type="button" className="btn sm" style={{ justifyContent: 'center' }} onClick={() => setCur({ pick: selRes.id, sel: null, pop: null })}>
                  Move seat
                </button>
                <button
                  type="button"
                  className="btn sm"
                  style={{ justifyContent: 'center' }}
                  onClick={() => {
                    const k = cur.sel!;
                    void act(`Clear ${fullName(selRes)}'s seat`, clearSeat(ref(k))).then((ok) => ok && setUi((u) => ({ ...u, sel: null })));
                  }}
                >
                  Clear seat
                </button>
              </div>
              <button
                type="button"
                className="sdlink"
                onClick={() => {
                  onResident(selRes.id);
                  navigate('residents');
                }}
              >
                Open in Residents <span aria-hidden="true">→</span>
              </button>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

function PopRow({ name, where, first, onClick }: { name: string; where: string; first: boolean; onClick: () => void }) {
  return (
    <button type="button" className={first ? 'poprow first' : 'poprow'} onClick={onClick}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ flex: 'none', fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>{where}</span>
    </button>
  );
}
