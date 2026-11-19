import { useState } from 'react';
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
import { cropOf, frameCrop, seatKey, seatingScale, seatRoom } from '../seating/model';
import { SeatRoomView } from '../seating/SeatRoomView';

// An event's seating map. "Arrange seats" lays everyone out (see domain/arrange.ts); moving
// people by hand comes later. Guests show as "Guest" beside their host.

const GUEST = 'guest:';
const guestOf = (host: Resident, g: number): Resident => ({ ...host, id: `${GUEST}${host.id}:${g}`, first: 'Guest', last: `of ${fullName(host)}`, nickname: null, notes: [] });
const nameOf = (r: Resident) => (r.id.startsWith(GUEST) ? 'Guest' : shortName(r));

export function EventSeating({ event: e, site }: { event: DiningEvent; site: Site }) {
  const data = useStore((s) => s.data);
  const [fitRef, fit] = useSize<HTMLDivElement>();
  const sections = site.meals.find((m) => m.meal === e.meal)?.sections ?? [];
  const [sectionPick, setSection] = useState(sections[0]?.section ?? 1);
  const section = sections.some((s) => s.section === sectionPick) ? sectionPick : (sections[0]?.section ?? 1);
  // Reasons from the last arrange, shown until the next one (not saved).
  const [notes, setNotes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState<ReturnType<typeof E.planSeats> | null>(null);

  const all = E.eventTables(data, e);
  const tables = all.filter((t) => t.section === section);
  const state = E.seatingState(data, e);
  const byId = new Map(data.residents.map((r) => [r.id, r]));
  const bySeat = new Map<string, Resident>();
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
  const room = seatRoom(tables, sc, view, (k) => bySeat.get(k) ?? null, false, nameOf);
  const seatedIn = (n: number) => e.seats.filter((s) => all.find((t) => t.id === s.tableId)?.section === n).length;

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
          {e.seats.length ? 'Arrange again' : 'Arrange seats'}
        </button>
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

      {e.seats.length > 0 && state.unseated.length > 0 && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FCD34D', fontSize: 13, color: '#78350F' }}>
          The guest list changed since seats were arranged: {state.unseated.length} {state.unseated.length === 1 ? 'person isn’t' : 'people aren’t'} seated. Use Arrange again.
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
          <SeatRoomView room={room} selectedKey={null} picking={false} onSeatClick={() => {}} onDrop={() => {}}>
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
