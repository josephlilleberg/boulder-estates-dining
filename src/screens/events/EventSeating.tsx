import { useEffect, useState } from 'react';
import { names } from '../../domain/arrange';
import { fullName, shortName, type DiningEvent, type Resident } from '../../domain/model';
import type { Site } from '../../domain/sites';
import { seatCount } from '../../domain/tables';
import { Segmented } from '../../shell/Segmented';
import { act } from '../../state/act';
import * as E from '../../state/eventActions';
import { useStore } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import { useSize } from '../../ui/useSize';
import { cropOf, frameCrop, parseSeatKey, seatKey, seatingScale, seatRoom, type SeatKey, type SeatLabel } from '../seating/model';
import { SeatRoomView } from '../seating/SeatRoomView';

// An event's seating map. "Arrange seats" lays everyone out (see domain/arrange.ts). Drag a name
// (or select it, then click an empty seat) to move it; moved people are pinned, so arranging
// again works around them. Guests show as "Guest" beside their host.

const GUEST = 'guest:';
const guestOf = (host: Resident, g: number): Resident => ({ ...host, id: `${GUEST}${host.id}:${g}`, first: 'Guest', last: `of ${fullName(host)}`, nickname: null, notes: [] });
const nameOf = (r: Resident) => (r.id.startsWith(GUEST) ? 'Guest' : shortName(r));
/** The map's ids back to a person: a resident's id, or "guest:<host id>:<n>". */
function whoOf(id: string): E.Who {
  if (!id.startsWith(GUEST)) return { residentId: id, guest: 0 };
  const rest = id.slice(GUEST.length);
  const i = rest.lastIndexOf(':');
  return { residentId: rest.slice(0, i), guest: Number(rest.slice(i + 1)) };
}

export function EventSeating({ event: e, site }: { event: DiningEvent; site: Site }) {
  const data = useStore((s) => s.data);
  const [fitRef, fit] = useSize<HTMLDivElement>();
  const sections = site.meals.find((m) => m.meal === e.meal)?.sections ?? [];
  const [sectionPick, setSection] = useState(sections[0]?.section ?? 1);
  const section = sections.some((s) => s.section === sectionPick) ? sectionPick : (sections[0]?.section ?? 1);
  // Reasons from the last arrange, shown until the next one (not saved).
  const [notes, setNotes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState<ReturnType<typeof E.planSeats> | null>(null);
  const [sel, setSel] = useState<SeatKey | null>(null);
  // Placing someone from the Not seated list: click a seat.
  const [pick, setPick] = useState<E.Who | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!pick) return;
    const on = (ev: KeyboardEvent) => ev.key === 'Escape' && setPick(null);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [pick]);

  const all = E.eventTables(data, e);
  const tables = all.filter((t) => t.section === section);
  const state = E.seatingState(data, e);
  const byId = new Map(data.residents.map((r) => [r.id, r]));
  const bySeat = new Map<string, Resident>();
  const pinnedKeys = new Set(e.seats.filter((s) => s.pinned).map((s) => seatKey(s.tableId, s.seat)));
  const extras = new Map<string, string[]>(); // table → names in extra places
  for (const s of e.seats) {
    const host = byId.get(s.residentId);
    if (!host) continue;
    const who = s.guest ? guestOf(host, s.guest) : host;
    const t = all.find((x) => x.id === s.tableId);
    if (t && s.seat >= seatCount(t.shape)) extras.set(t.id, [...(extras.get(t.id) ?? []), s.guest ? `Guest of ${shortName(host)}` : shortName(host)]);
    else bySeat.set(seatKey(s.tableId, s.seat), who);
  }
  const seated = e.seats.filter((s) => all.some((t) => t.id === s.tableId)).length;

  const crop = cropOf(tables);
  const sc = seatingScale(crop, fit.w, fit.h);
  const view = crop && fit.w ? frameCrop(crop, sc, fit.w, fit.h) : crop;
  const room = seatRoom(tables, sc, view, (k) => bySeat.get(k) ?? null, !!pick, nameOf);
  const seatedIn = (n: number) => e.seats.filter((s) => all.find((t) => t.id === s.tableId)?.section === n).length;

  const nameOfWho = (w: E.Who) => {
    const r = byId.get(w.residentId);
    return !r ? '' : w.guest ? `Guest of ${shortName(r)}` : fullName(r);
  };

  /** Seat or swap; one undo step. A rule that stops it shows above the map instead. */
  const move = async (who: E.Who, k: SeatKey) => {
    const target = parseSeatKey(k);
    const res = E.planMove(data, e, who, target);
    if ('error' in res) return setMsg(res.error);
    setMsg(null);
    setPick(null);
    if (!res.ops.length) return;
    if (await act(`Move ${nameOfWho(who)} · ${e.name}`, E.moveSeat(e.id, who, target))) setSel(k);
  };

  const onSeatClick = (lab: SeatLabel) => {
    if (pick) return void move(pick, lab.key);
    if (lab.resident) {
      setMsg(null);
      return setSel(lab.key === sel ? null : lab.key);
    }
    // An empty seat with someone selected: move them there.
    const selRes = sel ? bySeat.get(sel) : undefined;
    if (selRes) void move(whoOf(selRes.id), lab.key);
  };

  const selSeat = sel ? e.seats.find((s) => seatKey(s.tableId, s.seat) === sel) : undefined;
  const selWho = selSeat ? { residentId: selSeat.residentId, guest: selSeat.guest } : null;
  const selTable = selSeat && all.find((t) => t.id === selSeat.tableId);
  const nPinned = e.seats.filter((s) => s.pinned).length;

  const run = async (allowOver: boolean) => {
    const plan = E.planSeats(data, e, allowOver);
    if (!allowOver && plan.unplaced.length) return setAsking(plan);
    setAsking(null);
    if (await act(`Arrange seats · ${e.name}`, E.arrangeSeats(e.id, allowOver))) setNotes(plan.notes);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
        <button type="button" className="btn sm primary" onClick={() => void run(false)}>
          {nPinned ? 'Arrange the rest' : e.seats.length ? 'Arrange again' : 'Arrange seats'}
        </button>
        {nPinned > 0 && (
          <button type="button" className="linkbtn" onClick={() => void act(`Unpin all · ${e.name}`, E.unpinAll(e.id))} title="Arranging again will then move anyone">
            Unpin all ({nPinned})
          </button>
        )}
        <span style={{ fontSize: 13, color: '#4B5563' }}>
          {seated} seated{state.unseated.length ? ` · ${state.unseated.length} not seated` : ''}
          {state.over.size ? ` · ${[...state.over.values()].reduce((a, b) => a + b, 0)} over` : ''}
        </span>
        <div style={{ flex: '1 1 0' }} />
        {sections.length > 1 && (
          <Segmented
            label="Section"
            role="tablist"
            options={sections.map((s) => ({ value: String(s.section), label: `${s.label} · ${seatedIn(s.section)}` }))}
            value={String(section)}
            onChange={(v) => setSection(Number(v))}
          />
        )}
      </div>

      {state.unseated.length > 0 && e.seats.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            borderRadius: 8,
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            fontSize: 13,
            color: '#78350F',
          }}
        >
          <strong style={{ marginRight: 4 }}>Not seated ({state.unseated.length})</strong>
          {state.unseated.map((w) => {
            const on = pick?.residentId === w.residentId && pick.guest === w.guest;
            return (
              <button
                key={`${w.residentId}|${w.guest}`}
                type="button"
                aria-pressed={on}
                onClick={() => (setSel(null), setMsg(null), setPick(on ? null : w))}
                style={{
                  height: 26,
                  padding: '0 8px',
                  borderRadius: 6,
                  border: `1px solid ${on ? '#2563EB' : '#FCD34D'}`,
                  background: on ? '#DBEAFE' : '#FFFFFF',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: '#111827',
                  cursor: 'pointer',
                }}
              >
                {nameOfWho(w)}
              </button>
            );
          })}
          <span style={{ marginLeft: 4 }}>Click one, then a seat, or use Arrange again.</span>
        </div>
      )}

      {pick && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: 14, color: '#1E3A8A' }}>
          <span style={{ flex: 1 }}>
            Placing <strong>{nameOfWho(pick)}</strong>
            {pick.guest === 0 && (e.attendees.find((a) => a.residentId === pick.residentId)?.guests ?? 0) > 0 ? ' and their guests' : ''}. Click a seat.
          </span>
          <button type="button" className="btn sm" onClick={() => setPick(null)}>
            Cancel
          </button>
        </div>
      )}

      {selSeat && selWho && !pick && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px 12px',
            padding: '8px 12px',
            borderRadius: 8,
            background: '#F9FAFB',
            border: '1px solid #E5E7EB',
            fontSize: 13,
            color: '#374151',
          }}
        >
          <span style={{ flex: '1 1 240px' }}>
            <strong style={{ color: '#111827' }}>{nameOfWho(selWho)}</strong>
            {selTable ? ` · ${E.tableLabel(data, e, selTable)}` : ''}
            {selSeat.pinned ? ' · pinned' : ''}
            <span style={{ color: '#6B7280' }}> · Drag to move, or click an empty seat.</span>
          </span>
          <button
            type="button"
            className="btn sm"
            onClick={() =>
              void act(`${selSeat.pinned ? 'Unpin' : 'Pin'} ${nameOfWho({ residentId: selSeat.residentId, guest: 0 })} · ${e.name}`, E.setPinned(e.id, selSeat.residentId, !selSeat.pinned))
            }
          >
            {selSeat.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button type="button" className="btn sm" onClick={() => void act(`Take ${nameOfWho(selWho)} off their seat · ${e.name}`, E.unseat(e.id, selWho)).then(() => setSel(null))}>
            Take off seat
          </button>
          <button type="button" className="iconbtn" aria-label="Close" style={{ width: 28, height: 28 }} onClick={() => setSel(null)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}

      {msg && (
        <div
          role="alert"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FCA5A5', fontSize: 13, color: '#991B1B' }}
        >
          <span style={{ flex: 1 }}>{msg}</span>
          <button type="button" className="linkbtn" onClick={() => setMsg(null)}>
            OK
          </button>
        </div>
      )}

      {notes && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#F0F9FF', border: '1px solid #BAE6FD', fontSize: 13, color: '#0C4A6E', maxHeight: 132, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: notes.length ? 4 : 0 }}>
            <strong style={{ flex: 1 }}>{notes.length ? 'What changed from everyday seating' : 'Everyone is at their usual seat.'}</strong>
            <button type="button" className="linkbtn" onClick={() => setNotes(null)}>
              Hide
            </button>
          </div>
          {notes.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div ref={fitRef} style={{ flex: '1 1 0', minHeight: 0, overflow: 'auto', padding: 2, display: 'grid', justifyContent: 'safe center' }}>
        {fit.w > 0 && (
          <SeatRoomView room={room} selectedKey={sel} picking={!!pick} pinned={pinnedKeys} onSeatClick={onSeatClick} onDrop={(id, k) => void move(whoOf(id), k)}>
            {room.tables.map((t) => {
              const over = state.over.get(t.id);
              if (!over) return null;
              return (
                <div
                  key={`over-${t.id}`}
                  title={(extras.get(t.id) ?? []).join(', ')}
                  style={{
                    position: 'absolute',
                    left: t.l + t.w / 2,
                    top: t.t + t.h / 2 + Math.round(16 * sc),
                    transform: 'translateX(-50%)',
                    zIndex: 3,
                    padding: '1px 6px',
                    borderRadius: 6,
                    background: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: Math.max(10, Math.round(12 * sc)),
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  +{over} over
                </div>
              );
            })}
          </SeatRoomView>
        )}
      </div>

      {asking && (
        <Dialog
          title="Not everyone fits"
          onClose={() => setAsking(null)}
          footer={
            <>
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setAsking(null)} data-autofocus>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={() => void run(true)}>
                Seat them over
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
            No table seats {names(asking.unplaced)}. Seat {asking.unplaced.length === 1 ? 'them' : 'each party'} at the table with the most room, with extra places squeezed in? That table will show a
            red <strong>+ over</strong>.
          </p>
        </Dialog>
      )}
    </div>
  );
}
