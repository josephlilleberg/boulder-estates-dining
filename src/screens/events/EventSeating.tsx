import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { names } from '../../domain/arrange';
import { fullName, shortName, type DiningEvent, type Resident } from '../../domain/model';
import type { Site } from '../../domain/sites';
import { seatCount } from '../../domain/tables';
import { Segmented } from '../../shell/Segmented';
import { act } from '../../state/act';
import * as E from '../../state/eventActions';
import { getStore, useStore } from '../../state/store';
import { Dialog } from '../../ui/Dialog';
import { useSize } from '../../ui/useSize';
import { cropOf, frameCrop, parseSeatKey, seatKey, seatingScale, seatRoom, type SeatKey, type SeatLabel } from '../seating/model';
import { dropTargetAt, SeatRoomView } from '../seating/SeatRoomView';

// An event's seating map, with a side panel: who's selected, who isn't seated yet, and what's
// changed from everyday seating. "Arrange seats" lays everyone out (see domain/arrange.ts). Drag a
// name onto a seat (or a table, to sit wherever there's room); moved people are pinned, so arranging
// again works around them. Guests show as "Guest" beside their host, with the host's name above.

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
  const [boxRef, box] = useSize<HTMLDivElement>();
  const [fitRef, fit] = useSize<HTMLDivElement>();
  const sections = site.meals.find((m) => m.meal === e.meal)?.sections ?? [];
  const [sectionPick, setSection] = useState(sections[0]?.section ?? 1);
  const section = sections.some((s) => s.section === sectionPick) ? sectionPick : (sections[0]?.section ?? 1);
  const [asking, setAsking] = useState<ReturnType<typeof E.planSeats> | null>(null);
  const [sel, setSel] = useState<SeatKey | null>(null);
  // Placing someone from the Not seated list: click a seat (or drag them onto one).
  const [pick, setPick] = useState<E.Who | null>(null);
  const [drag, setDrag] = useState<{ who: E.Who; name: string; x: number; y: number; over: SeatKey | null } | null>(null);
  const dragStart = useRef<{ who: E.Who; name: string; pointer: number; sx: number; sy: number; moved: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!pick && !sel) return;
    const on = (ev: KeyboardEvent) => ev.key === 'Escape' && (setPick(null), setSel(null));
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [pick, sel]);

  const all = E.eventTables(data, e);
  const tables = all.filter((t) => t.section === section);
  const state = E.seatingState(data, e);
  const changes = E.eventChanges(data, e);
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
  const tableInfo = new Map(
    all.map((t) => {
      const n = e.seats.filter((s) => s.tableId === t.id).length;
      return [t.id, { text: `${n}/${seatCount(t.shape)}`, dim: n === 0 }];
    }),
  );
  const used = [...tableInfo.values()].filter((x) => !x.dim).length;

  const wide = box.w >= 900;
  const crop = cropOf(tables);
  const sc = seatingScale(crop, fit.w, fit.h);
  const view = crop && fit.w ? frameCrop(crop, sc, fit.w, fit.h) : crop;
  const placing = !!pick || !!drag;
  const ownerOf = (r: Resident) => {
    if (!r.id.startsWith(GUEST)) return null;
    const host = byId.get(whoOf(r.id).residentId);
    return host ? shortName(host) : null;
  };
  const room = seatRoom(tables, sc, view, (k) => bySeat.get(k) ?? null, placing, nameOf, ownerOf);
  const seatedIn = (n: number) => e.seats.filter((s) => all.find((t) => t.id === s.tableId)?.section === n).length;

  const nameOfWho = (w: E.Who) => {
    const r = byId.get(w.residentId);
    return !r ? '' : w.guest ? `Guest of ${shortName(r)}` : fullName(r);
  };
  const partyOf = (w: E.Who) => (w.guest === 0 && (e.attendees.find((a) => a.residentId === w.residentId)?.guests ?? 0) > 0 ? ' and their guests' : '');

  /** Seat, swap, or seat at a table; one undo step. A rule that stops it shows in the panel instead. */
  const apply = async (who: E.Who, res: { ops: unknown[] } | { error: string }, ops: Parameters<typeof act>[1], then?: () => void) => {
    if ('error' in res) return setMsg(res.error);
    setMsg(null);
    setPick(null);
    if (!res.ops.length) return;
    if (await act(`Move ${nameOfWho(who)} · ${e.name}`, ops)) then?.();
  };
  const move = (who: E.Who, k: SeatKey) => {
    const target = parseSeatKey(k);
    return apply(who, E.planMove(data, e, who, target), E.moveSeat(e.id, who, target), () => setSel(k));
  };
  const moveToTable = (who: E.Who, tableId: string) =>
    apply(who, E.planMoveToTable(data, e, who, tableId), E.moveToTable(e.id, who, tableId), () => {
      const s = getStore()
        .get()
        .data.events.find((x) => x.id === e.id)
        ?.seats.find((x) => x.residentId === who.residentId && x.guest === who.guest);
      setSel(s ? seatKey(s.tableId, s.seat) : null);
    });

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

  // Dragging a name from the Not seated list onto the map (pointer events, like the map's own drags).
  const listDown = (who: E.Who, name: string) => (ev: PointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragStart.current = { who, name, pointer: ev.pointerId, sx: ev.clientX, sy: ev.clientY, moved: false };
  };
  const listMove = (ev: PointerEvent<HTMLButtonElement>) => {
    const g = dragStart.current;
    if (!g || g.pointer !== ev.pointerId) return;
    if (!g.moved && Math.abs(ev.clientX - g.sx) + Math.abs(ev.clientY - g.sy) < 5) return;
    g.moved = true;
    const t = dropTargetAt(ev.clientX, ev.clientY);
    setDrag({ who: g.who, name: g.name, x: ev.clientX, y: ev.clientY, over: t && 'seat' in t ? t.seat : null });
  };
  const listUp = (ev: PointerEvent<HTMLButtonElement>) => {
    const g = dragStart.current;
    if (!g || g.pointer !== ev.pointerId) return;
    dragStart.current = null;
    setDrag(null);
    if (!g.moved) {
      // A click: pick them, then click a seat.
      setSel(null);
      setMsg(null);
      setPick(pick && pick.residentId === g.who.residentId && pick.guest === g.who.guest ? null : g.who);
      return;
    }
    const t = ev.type === 'pointerup' ? dropTargetAt(ev.clientX, ev.clientY) : null;
    if (t && 'seat' in t) void move(g.who, t.seat);
    else if (t && 'table' in t) void moveToTable(g.who, t.table);
  };

  const selSeat = sel ? e.seats.find((s) => seatKey(s.tableId, s.seat) === sel) : undefined;
  const selWho = selSeat ? { residentId: selSeat.residentId, guest: selSeat.guest } : null;
  const selTable = selSeat && all.find((t) => t.id === selSeat.tableId);
  const nPinned = e.seats.filter((s) => s.pinned).length;
  // Relatives at this event, by family; "together" when all of them sit at one table.
  const families = [...new Set(e.attendees.filter((a) => a.family && a.status === 'coming').map((a) => a.family!))]
    .map((f) => e.attendees.filter((a) => a.family === f && a.status === 'coming').map((a) => a.residentId))
    .filter((ids) => ids.length > 1);
  const together = (ids: string[]) => new Set(ids.map((id) => e.seats.find((s) => s.residentId === id && s.guest === 0)?.tableId ?? `none:${id}`)).size === 1;

  const run = async (allowOver: boolean) => {
    const plan = E.planSeats(data, e, allowOver);
    if (!allowOver && plan.unplaced.length) return setAsking(plan);
    setAsking(null);
    await act(`Arrange seats · ${e.name}`, E.arrangeSeats(e.id, allowOver));
  };

  /** Jump to someone on the map: their section, their seat selected. */
  const show = (residentId: string) => {
    const s = e.seats.find((x) => x.residentId === residentId && x.guest === 0);
    const t = s && all.find((x) => x.id === s.tableId);
    if (!s || !t) return;
    setSection(t.section);
    setPick(null);
    setSel(seatKey(s.tableId, s.seat));
  };

  const panel = (
    <aside
      aria-label="Seating details"
      style={{
        width: wide ? 280 : undefined,
        flex: wide ? 'none' : '0 0 auto',
        maxHeight: wide ? undefined : 240,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {msg && (
        <div role="alert" style={{ ...card, background: '#FEF2F2', borderColor: '#FCA5A5', color: '#991B1B' }}>
          <div style={{ marginBottom: 6 }}>{msg}</div>
          <button type="button" className="linkbtn" onClick={() => setMsg(null)}>
            OK
          </button>
        </div>
      )}

      {pick && (
        <div style={{ ...card, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E3A8A' }}>
          <div style={{ marginBottom: 8 }}>
            Placing <strong>{nameOfWho(pick)}</strong>
            {partyOf(pick)}. Click a seat, or a table to seat them wherever there’s room.
          </div>
          <button type="button" className="btn sm" onClick={() => setPick(null)}>
            Cancel
          </button>
        </div>
      )}

      {selSeat && selWho && !pick && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{nameOfWho(selWho)}</div>
              <div style={{ color: '#4B5563', marginTop: 2 }}>
                {selTable ? E.tableLabel(data, e, selTable) : ''}
                {selSeat.pinned ? ' · pinned' : ''}
              </div>
            </div>
            <button type="button" className="iconbtn" aria-label="Close" style={{ width: 28, height: 28 }} onClick={() => setSel(null)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div style={{ color: '#6B7280', margin: '6px 0 10px', lineHeight: 1.45 }}>Drag to a seat or a table, or click an empty seat. Drop on someone to swap.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sm"
              title={selSeat.pinned ? 'Arranging again may move them' : 'Arranging again leaves them here'}
              onClick={() =>
                void act(`${selSeat.pinned ? 'Unpin' : 'Pin'} ${nameOfWho({ residentId: selSeat.residentId, guest: 0 })} · ${e.name}`, E.setPinned(e.id, selSeat.residentId, !selSeat.pinned))
              }
            >
              {selSeat.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" className="btn sm" onClick={() => void act(`Take ${nameOfWho(selWho)} off their seat · ${e.name}`, E.unseat(e.id, selWho)).then(() => setSel(null))}>
              Take off seat
            </button>
          </div>
          {selWho.guest === 0 && <Relatives event={e} residentId={selWho.residentId} />}
        </div>
      )}

      {families.length > 0 && (
        <div style={{ ...card, padding: 0 }}>
          <div style={head}>Relatives ({families.length})</div>
          {families.map((ids) => (
            <div key={ids.join('|')} style={{ ...rowStyle, cursor: 'default', flexWrap: 'wrap', gap: '2px 6px' }}>
              {ids.map((id, i) => (
                <button key={id} type="button" className="linkbtn" style={{ fontWeight: 600, color: '#111827' }} onClick={() => show(id)} title="Show on the map">
                  {nameOfWho({ residentId: id, guest: 0 })}
                  {i < ids.length - 1 ? ',' : ''}
                </button>
              ))}
              {!together(ids) && <span style={{ color: '#B45309', fontSize: 12, fontWeight: 600 }}>not together yet · Arrange again</span>}
            </div>
          ))}
        </div>
      )}

      {state.unseated.length > 0 && (
        <div style={{ ...card, padding: 0, borderColor: '#FCD34D' }}>
          <div style={{ ...head, background: '#FFFBEB', color: '#78350F' }}>Not seated ({state.unseated.length})</div>
          {state.unseated.map((w) => {
            const on = pick?.residentId === w.residentId && pick.guest === w.guest;
            const name = nameOfWho(w);
            return (
              <button
                key={`${w.residentId}|${w.guest}`}
                type="button"
                aria-pressed={on}
                title="Drag onto a seat or table, or click, then click a seat"
                onPointerDown={listDown(w, name)}
                onPointerMove={listMove}
                onPointerUp={listUp}
                onPointerCancel={listUp}
                style={{ ...rowStyle, background: on ? '#DBEAFE' : '#FFFFFF', touchAction: 'none', cursor: drag ? 'grabbing' : 'grab' }}
              >
                <svg viewBox="0 0 10 16" width="7" height="12" aria-hidden="true" style={{ flex: 'none', color: '#9CA3AF' }}>
                  {[3, 8, 13].flatMap((y) => [<circle key={`a${y}`} cx="2.5" cy={y} r="1.3" fill="currentColor" />, <circle key={`b${y}`} cx="7.5" cy={y} r="1.3" fill="currentColor" />])}
                </svg>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ ...card, padding: 0 }}>
        <div style={head}>Changes from everyday ({changes.length})</div>
        {changes.length === 0 && <div style={{ padding: '8px 12px', color: '#4B5563' }}>{e.seats.length ? 'Everyone seated is at their usual table.' : 'Nothing arranged yet.'}</div>}
        {changes.map((c) => (
          <button key={c.residentId} type="button" onClick={() => show(c.residentId)} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 1 }} title="Show on the map">
            <span style={{ fontWeight: 600, color: '#111827' }}>{c.name}</span>
            <span style={{ color: '#4B5563', fontSize: 12 }}>{c.text}</span>
          </button>
        ))}
      </div>
    </aside>
  );

  return (
    <div ref={boxRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', minHeight: 0, flex: 1 }}>
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
          {` · ${used} of ${all.length} tables`}
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

      <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <div ref={fitRef} style={{ flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'auto', padding: 2, display: 'grid', justifyContent: 'safe center' }}>
          {fit.w > 0 && (
            <SeatRoomView
              room={room}
              selectedKey={drag ? drag.over : sel}
              picking={placing}
              pinned={pinnedKeys}
              tableInfo={tableInfo}
              onSeatClick={onSeatClick}
              onDrop={(id, k) => void move(whoOf(id), k)}
              onDropTable={(id, t) => void moveToTable(whoOf(id), t)}
            >
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
                      top: t.t + t.h / 2 + Math.round(22 * sc),
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
        {panel}
      </div>

      {drag && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: drag.x + 10,
            top: drag.y + 8,
            zIndex: 50,
            pointerEvents: 'none',
            padding: '4px 8px',
            borderRadius: 6,
            background: '#FFFFFF',
            border: '1px solid #93C5FD',
            boxShadow: '0 4px 12px rgba(17,24,39,.18)',
            fontSize: 12,
            fontWeight: 600,
            color: '#111827',
            whiteSpace: 'nowrap',
          }}
        >
          {drag.name}
        </div>
      )}

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

const card: CSSProperties = { padding: '10px 12px', borderRadius: 10, background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', overflow: 'hidden', flex: 'none' };
const head: CSSProperties = { padding: '8px 12px', background: '#F7F8FA', borderBottom: '1px solid #EEF0F3', fontSize: 12, fontWeight: 700, color: '#4B5563' };
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '7px 12px',
  border: 0,
  borderBottom: '1px solid #F0F1F3',
  background: '#FFFFFF',
  fontFamily: 'inherit',
  fontSize: 13,
  color: '#111827',
  textAlign: 'left',
  cursor: 'pointer',
};

/**
 * The selected resident's relatives at this event, with × to unlink, and a search to link another
 * resident who's coming. Arrange then seats the family side by side at one table.
 */
function Relatives({ event: e, residentId }: { event: DiningEvent; residentId: string }) {
  const data = useStore((s) => s.data);
  const [q, setQ] = useState('');
  const list = E.guestList(data, e).filter((a) => a.status === 'coming');
  const mine = new Set(E.relativesOf(e, residentId));
  const relatives = list.filter((a) => mine.has(a.residentId) && a.residentId !== residentId);
  const needle = q.trim().toLowerCase();
  const matches = needle ? list.filter((a) => !mine.has(a.residentId) && `${a.resident.first} ${a.resident.last} ${a.resident.nickname ?? ''}`.toLowerCase().includes(needle)).slice(0, 6) : [];
  const me = fullName(byIdOf(data.residents, residentId));
  const link = (a: E.ListedAttendee) => void act(`${me} and ${fullName(a.resident)} are relatives · ${e.name}`, E.linkRelatives(e.id, residentId, a.residentId)).then(() => setQ(''));

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #EEF0F3' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#4B5563', marginBottom: 6 }}>Relatives (seated together)</div>
      {relatives.map((a) => (
        <div key={a.residentId} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 30 }}>
          <span style={{ flex: 1, minWidth: 0 }}>{fullName(a.resident)}</span>
          <button
            type="button"
            className="iconbtn"
            style={{ width: 26, height: 26 }}
            aria-label={`Not relatives: ${fullName(a.resident)}`}
            title="Not relatives"
            onClick={() => void act(`${fullName(a.resident)} not with ${me} · ${e.name}`, E.unlinkRelative(e.id, a.residentId))}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      ))}
      <div>
        <input
          autoComplete="off"
          type="search"
          aria-label="Add a relative"
          placeholder="+ Add a relative"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape') {
              ev.stopPropagation();
              setQ('');
            } else if (ev.key === 'Enter' && matches.length === 1) link(matches[0]!);
          }}
          style={{ width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', border: 0, background: '#F1F3F5', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#111827' }}
        />
        {needle && (
          // Inline under the box: the side panel scrolls, so a floating list would be cut off.
          <div style={{ marginTop: 4, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, overflow: 'hidden' }}>
            {matches.length ? (
              matches.map((a) => (
                <div key={a.residentId} className="pickrow" onClick={() => link(a)} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F1F3' }}>
                  {fullName(a.resident)}
                </div>
              ))
            ) : (
              <div style={{ padding: '8px 10px', fontSize: 13, color: '#4B5563' }}>No one coming by that name.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const byIdOf = (rs: Resident[], id: string): Resident => rs.find((r) => r.id === id)!;
