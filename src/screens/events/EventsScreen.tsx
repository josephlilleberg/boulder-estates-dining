import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { fullName, isAway, type DiningEvent, type Resident } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { localDate } from '../../state/backup';
import { act, actUndoable } from '../../state/act';
import * as E from '../../state/eventActions';
import { useStore } from '../../state/store';
import { Dialog, Field } from '../../ui/Dialog';
import { Segmented } from '../../shell/Segmented';
import { useSize } from '../../ui/useSize';
import type { ScreenProps } from '../types';
import { EventSeating } from './EventSeating';
import { EventSheetDialog, type EventSheet } from './EventSheets';

// Special events (Thanksgiving Dinner): a guest list of their own, made from whoever comes
// to that meal today. Everyday seating and residents' cards are never changed here.

const PANEL_HEIGHT = 'max(640px, calc(100vh - 160px))';

export const eventDate = (d: string) =>
  new Date(`${d}T00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

export function EventsScreen({ site }: ScreenProps) {
  const data = useStore((s) => s.data);
  const events = useMemo(() => data.events.filter((e) => e.siteId === site.id), [data.events, site.id]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'new' | 'edit'>(null);
  const picked = events.find((e) => e.id === pickedId) ?? events[0] ?? null;

  return (
    <>
      {picked ? (
        <EventCard
          key={picked.id}
          event={picked}
          events={events}
          site={site}
          onPick={setPickedId}
          onNew={() => setDialog('new')}
          onEdit={() => setDialog('edit')}
          onDeleted={() => setPickedId(null)}
        />
      ) : (
        <section className="card" style={{ height: PANEL_HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Events</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#4B5563', maxWidth: 360 }}>Thanksgiving, Christmas and the like: a guest list and seating of their own.</p>
          <button type="button" className="btn primary" onClick={() => setDialog('new')}>
            + New event
          </button>
        </section>
      )}

      {dialog === 'new' && (
        <EventDialog
          site={site}
          onClose={() => setDialog(null)}
          onSaved={(id) => {
            setDialog(null);
            setPickedId(id);
          }}
        />
      )}
      {dialog === 'edit' && picked && <EventDialog site={site} event={picked} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
    </>
  );
}

// ---- One event -------------------------------------------------------------------------------

interface CardProps {
  event: DiningEvent;
  events: DiningEvent[];
  site: Site;
  onPick: (id: string) => void;
  onNew: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

function EventCard({ event: e, events, site, onPick, onNew, onEdit, onDeleted }: CardProps) {
  const data = useStore((s) => s.data);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<'list' | 'seats'>('list');
  const t = E.eventTotals(data, e);
  const [sheet, setSheet] = useState<EventSheet | null>(null);

  return (
    <section className="card" style={{ height: PANEL_HEIGHT, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <select
              aria-label="Event"
              value={e.id}
              onChange={(ev) => onPick(ev.target.value)}
              style={{
                appearance: 'none',
                maxWidth: '100%',
                height: 40,
                padding: '0 34px 0 12px',
                border: '1px solid #D0D5DD',
                borderRadius: 8,
                background: '#FFFFFF',
                fontFamily: 'inherit',
                fontSize: 18,
                fontWeight: 700,
                color: '#111827',
                cursor: 'pointer',
              }}
            >
              {events.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="#4B5563"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ position: 'absolute', right: 12, top: 12, pointerEvents: 'none' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <span style={{ fontSize: 14, color: '#4B5563' }}>
            {eventDate(e.date)} · {e.meal}
          </span>
          <span style={{ flex: '1 1 0' }} />
          <button type="button" className="btn sm" onClick={onNew}>
            + New event
          </button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="iconbtn" aria-label="More" aria-haspopup="menu" aria-expanded={menuOpen} title="More" onClick={() => setMenuOpen((o) => !o)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div role="menu" className="menu">
                  <button type="button" role="menuitem" onClick={() => (setMenuOpen(false), onEdit())}>
                    Edit name and date
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={async () => {
                      setMenuOpen(false);
                      if (await actUndoable(`Delete ${e.name}`, E.deleteEvent(e.id), `Deleted ${e.name}`)) onDeleted();
                    }}
                  >
                    Delete event
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => setSheet('overview')} title="Who's cancelled and who's added, to view or print">
            Overview
          </button>
          <button type="button" className="btn sm" onClick={() => setSheet('residents')} title="Everyone coming, A–Z, with guests, to view or print">
            Resident sheet
          </button>
          <Stat big label="Total for meal" value={t.people} />
          <Stat label="Total cancellations" value={t.cancelled} />
          <span style={{ flex: '1 1 0' }} />
          <Segmented
            label="Show"
            role="tablist"
            options={[
              { value: 'list', label: 'Guest list' },
              { value: 'seats', label: 'Seating' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      {tab === 'seats' ? <EventSeating event={e} site={site} /> : <GuestList event={e} site={site} />}
      {sheet && <EventSheetDialog kind={sheet} event={e} data={data} dateText={eventDate(e.date)} onClose={() => setSheet(null)} />}
    </section>
  );
}

// ---- Guest list: Coming, Additions, Cancelled -------------------------------------------------

function GuestList({ event: e, site }: { event: DiningEvent; site: Site }) {
  const data = useStore((s) => s.data);
  const [box, size] = useSize<HTMLDivElement>();
  const [qAdd, setQAdd] = useState('');
  const [qCancel, setQCancel] = useState('');

  const list = E.guestList(data, e);
  const regulars = list.filter((a) => a.status === 'coming' && !a.added);
  const additions = list.filter(E.inAdditions);
  const cancelled = list.filter((a) => a.status === 'cancelled');
  const onList = new Set(e.attendees.map((a) => a.residentId));

  const matcher = (q: string) => {
    const needle = q.trim().toLowerCase();
    return (r: { first: string; last: string; nickname: string | null }) => !needle || `${r.first} ${r.last} ${r.nickname ?? ''}`.toLowerCase().includes(needle);
  };
  const label = (txt: string) => `${txt} · ${e.name}`;
  const setGuests = (a: E.ListedAttendee, n: number) => act(label(`${fullName(a.resident)}: ${n} ${n === 1 ? 'guest' : 'guests'}`), E.setGuests(e.id, a.residentId, n));

  // Additions search: someone coming without guests can bring one; anyone not on the list can be added.
  const mAdd = matcher(qAdd);
  // Anyone not on Additions yet: someone already coming, or anyone not on the list (cancelled people
  // aren't offered; × on Cancelled brings them back).
  const offered = new Set([...regulars.filter((a) => !E.inAdditions(a)).map((a) => a.residentId)]);
  const addable = qAdd.trim()
    ? data.residents
        .filter((r) => r.siteId === site.id && !r.archived && (offered.has(r.id) || !onList.has(r.id)) && mAdd(r))
        .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
        .slice(0, 8)
    : [];
  // Cancelled search: anyone still coming.
  const mCancel = matcher(qCancel);
  const cancellable = qCancel.trim() ? regulars.filter((a) => mCancel(a.resident)).slice(0, 8) : [];

  // Cancellations on the left, additions on the right; stacked when the window is narrow.
  const wide = size.w >= 560;
  const cancel = (a: E.ListedAttendee) => act(label(`${fullName(a.resident)} cancelled`), E.setAttendeeStatus(e.id, a.residentId, 'cancelled')).then(() => setQCancel(''));
  const addResident = (r: Resident) => act(label(`Add ${fullName(r)}`), E.addToAdditions(e.id, r.id)).then(() => setQAdd(''));
  // Enter adds or cancels the only match, so a name can be typed and entered without the mouse.
  const enterAdd = () => {
    if (addable.length === 1) void addResident(addable[0]!);
  };
  const enterCancel = () => {
    if (cancellable.length === 1) void cancel(cancellable[0]!);
  };
  const tag = (a: E.ListedAttendee) => (a.onPlan ? [] : ['Not on plan']);

  return (
    <div
      ref={box}
      style={{
        flex: '1 1 0',
        minHeight: 0,
        padding: 16,
        display: 'grid',
        gap: 12,
        gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
        gridTemplateRows: wide ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)',
        background: '#F7F8FA',
      }}
    >
      <Column
        title="Cancelled"
        count={cancelled.length}
        q={qCancel}
        setQ={setQCancel}
        placeholder="Cancel someone"
        plus
        onEnter={enterCancel}
        results={
          !qCancel.trim() ? null : cancellable.length ? (
            cancellable.map((a) => (
              <Line key={a.residentId} name={fullName(a.resident)} onRow={() => void cancel(a)}>
                <button type="button" className="btn sm">
                  Cancel
                </button>
              </Line>
            ))
          ) : (
            <Hint text="No one coming by that name." />
          )
        }
      >
        {cancelled.map((a) => {
          const name = fullName(a.resident);
          return (
            <Line key={a.residentId} name={name} dim>
              {/* Like Additions' ×: off this list, which puts them back on the guest list. */}
              <XButton label={`Not cancelled: ${name} is coming after all`} onClick={() => act(label(`${name} coming`), E.setAttendeeStatus(e.id, a.residentId, 'coming'))} />
            </Line>
          );
        })}
        {cancelled.length === 0 && !qCancel.trim() && <Hint text="No one has cancelled." />}
      </Column>
      <Column
        title="Additions"
        count={additions.length}
        q={qAdd}
        setQ={setQAdd}
        placeholder="Add a guest or resident"
        plus
        onEnter={enterAdd}
        results={
          !qAdd.trim() ? null : addable.length ? (
            // Click a name: they go on Additions with no guests (set them on the list).
            addable.map((r) => <Line key={r.id} name={fullName(r)} tags={r.onPlan.includes(e.meal) ? [] : ['Not on plan']} onRow={() => void addResident(r)} />)
          ) : (
            <Hint text="No one to add by that name." />
          )
        }
      >
        {additions.map((a) => {
          const name = fullName(a.resident);
          return (
            <Line key={a.residentId} name={name} tags={[...(a.added ? ['Added'] : []), ...tag(a)]}>
              <Guests n={a.guests} name={name} onSet={(n) => setGuests(a, n)} />
              <PartyTotal n={1 + a.guests} />
              <XButton label={a.added ? `Remove ${name}` : `Off Additions: ${name} (no guests)`} onClick={() => act(label(`${name} off Additions`), E.removeFromAdditions(e.id, a.residentId))} />
            </Line>
          );
        })}
        {additions.length === 0 && !qAdd.trim() && <Hint text="Search above to add a resident, then set their guests here." />}
      </Column>

    </div>
  );
}

function Column({
  title,
  count,
  q,
  setQ,
  placeholder,
  plus,
  onEnter,
  style,
  results,
  children,
}: {
  title: string;
  count: number;
  q: string;
  setQ: (q: string) => void;
  placeholder: string;
  plus?: boolean;
  /** Enter in the search: act on the one match, if there's exactly one. */
  onEnter?: () => void;
  style?: CSSProperties;
  /** Search matches: an overlay under the search box, over the list however far it's scrolled. */
  results?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} style={{ ...style, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 10px', display: 'flex', flexDirection: 'column', gap: 10, borderBottom: '1px solid #EEF0F3' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>{title}</h3>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#4B5563' }}>{count}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: 'absolute', left: 10, top: 10 }}>
            {plus ? (
              <path d="M12 5v14M5 12h14" />
            ) : (
              <>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </>
            )}
          </svg>
          <input autoComplete="off"
            type="search"
            aria-label={`${title}: ${placeholder}`}
            placeholder={placeholder}
            value={q}
            onChange={(ev) => setQ(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') setQ('');
              else if (ev.key === 'Enter') onEnter?.();
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              height: 36,
              padding: '0 10px 0 32px',
              border: 0,
              background: '#F1F3F5',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'inherit',
              color: '#111827',
            }}
          />
        </div>
      </div>
      <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative' }}>
        <div style={{ height: '100%', overflowY: 'auto' }}>{children}</div>
        {results && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, maxHeight: '85%', overflowY: 'auto', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE', boxShadow: '0 10px 24px rgba(17,24,39,.16)' }}>
            {results}
          </div>
        )}
      </div>
    </section>
  );
}


/** A name and its controls. With `onRow`, the whole row is the click target (search results); its button just shows what a click does. */
function Line({ name, sub, tags = [], dim, onRow, children }: { name: string; sub?: string; tags?: string[]; dim?: boolean; onRow?: () => void; children?: ReactNode }) {
  return (
    <div
      className={onRow ? 'pickrow' : undefined}
      onClick={onRow}
      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '4px 10px 4px 14px', borderBottom: '1px solid #F0F1F3', cursor: onRow ? 'pointer' : undefined }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: dim ? '#6B7280' : '#111827', overflowWrap: 'anywhere' }}>{name}</span>
        {sub && <span style={{ fontSize: 12, color: '#4B5563' }}>{sub}</span>}
        {tags.map((t) => (
          <span key={t} style={{ padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: t === 'Added' ? '#DBEAFE' : '#FEF3C7', color: t === 'Added' ? '#1E40AF' : '#92400E' }}>
            {t}
          </span>
        ))}
      </span>
      {children}
    </div>
  );
}

/** A party's total, the resident plus their guests, so the count is never in doubt. */
function PartyTotal({ n }: { n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 5, minWidth: 72, marginLeft: 8 }} aria-label={`Total ${n}`}>
      <span style={{ fontSize: 12, color: '#4B5563' }}>Total</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{n}</span>
    </span>
  );
}

function XButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="iconbtn" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

const Hint = ({ text }: { text: string }) => <p style={{ margin: 0, padding: '14px', fontSize: 13, color: '#4B5563', lineHeight: 1.5 }}>{text}</p>;

/** "Total for meal 58": the label, then the number. */
function Stat({ value, label, big }: { value: number; label: string; big?: boolean }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '6px 12px', borderRadius: 8, background: big ? '#EFF6FF' : '#F3F4F6', border: `1px solid ${big ? '#BFDBFE' : '#E5E7EB'}` }}>
      <span style={{ fontSize: 13, color: '#4B5563' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 15, fontWeight: 700, color: '#111827' }}>{value}</span>
    </div>
  );
}

function Guests({ n, name, onSet }: { n: number; name: string; onSet: (n: number) => void }) {
  const btn = {
    width: 32,
    height: 32,
    border: '1px solid #D1D5DB',
    background: '#FFFFFF',
    borderRadius: 8,
    fontSize: 18,
    lineHeight: 1,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: '#111827',
  } as const;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} role="group" aria-label={`Guests with ${name}`}>
      <span style={{ fontSize: 12, color: '#4B5563' }}>Guests</span>
      <button
        type="button"
        aria-label="One fewer guest"
        disabled={n === 0}
        style={{
          ...btn,
          opacity: n === 0 ? 0.4 : 1,
          cursor: n === 0 ? 'default' : 'pointer',
        }}
        onClick={() => onSet(n - 1)}
      >
        −
      </button>
      <span
        style={{
          minWidth: 22,
          textAlign: 'center',
          fontSize: 15,
          fontWeight: 700,
          color: n ? '#111827' : '#9CA3AF',
        }}
      >
        {n}
      </span>
      <button type="button" aria-label="One more guest" disabled={n >= E.MAX_GUESTS} style={btn} onClick={() => onSet(n + 1)}>
        +
      </button>
    </span>
  );
}

// ---- New / edit ------------------------------------------------------------------------------

function EventDialog({ site, event, onClose, onSaved }: { site: Site; event?: DiningEvent; onClose: () => void; onSaved: (id: string) => void }) {
  const data = useStore((s) => s.data);
  const meals = site.meals.map((m) => m.meal);
  const [name, setName] = useState(event?.name ?? `Thanksgiving ${new Date().getFullYear()}`);
  const [date, setDate] = useState(event?.date ?? localDate());
  const [meal, setMeal] = useState<MealName>(event?.meal ?? (meals.includes('Dinner') ? 'Dinner' : meals[0]!));
  const regulars = data.residents.filter((r) => r.siteId === site.id && !r.archived && !isAway(r) && r.attends.includes(meal)).length;

  const submit = async () => {
    if (event) {
      if (await act(`Edit ${event.name}`, E.editEvent(event.id, name, date))) onSaved(event.id);
      return;
    }
    const { id, ops } = E.createEvent({ siteId: site.id, name, date, meal });
    if (await act(`New event: ${name.trim()}`, ops)) onSaved(id);
  };

  return (
    <Dialog
      title={event ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!name.trim() || !date} onClick={() => void submit()}>
            {event ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <Field label="Name">
          <input className="text-input" value={name} onChange={(ev) => setName(ev.target.value)} autoComplete="off" />
        </Field>
        <Field label="Date">
          <input className="text-input" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        {!event && meals.length > 1 && (
          <Field label="Meal">
            <div className="segwrap" role="group" aria-label="Meal">
              {meals.map((m) => (
                <button key={m} type="button" className={m === meal ? 'seg on' : 'seg'} aria-pressed={m === meal} onClick={() => setMeal(m)}>
                  {m}
                </button>
              ))}
            </div>
          </Field>
        )}
        {!event && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#4B5563',
              lineHeight: 1.5,
            }}
          >
            The guest list starts with the {regulars} residents who come to {meal} today. Then mark who’s cancelled, add anyone else, and enter guests.
          </p>
        )}
      </form>
    </Dialog>
  );
}
