import { useMemo, useState, type ReactNode } from 'react';
import { fullName, type DiningEvent } from '../../domain/model';
import type { MealName, Site } from '../../domain/sites';
import { localDate } from '../../state/backup';
import { act, actUndoable } from '../../state/act';
import * as E from '../../state/eventActions';
import { useStore } from '../../state/store';
import { Dialog, Field } from '../../ui/Dialog';
import { Segmented } from '../../shell/Segmented';
import type { ScreenProps } from '../types';
import { EventSeating } from './EventSeating';

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
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        alignItems: 'stretch',
      }}
    >
      <section
        className="card"
        style={{
          flex: '1 1 280px',
          maxWidth: 340,
          height: PANEL_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Events</h1>
          <button type="button" className="btn sm primary" onClick={() => setDialog('new')}>
            + New event
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {events.map((e) => {
            const t = E.eventTotals(data, e);
            return (
              <button
                key={e.id}
                type="button"
                className={picked?.id === e.id ? 'rrow on' : 'rrow'}
                aria-current={picked?.id === e.id || undefined}
                onClick={() => setPickedId(e.id)}
                style={{
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '10px 16px',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{e.name}</span>
                <span style={{ fontSize: 12, color: '#4B5563' }}>
                  {eventDate(e.date)} · {e.meal} · {t.people} coming
                </span>
              </button>
            );
          })}
          {events.length === 0 && (
            <p
              style={{
                margin: 0,
                padding: '24px 16px',
                fontSize: 14,
                color: '#4B5563',
                textAlign: 'center',
              }}
            >
              No events yet. Use + New event for Thanksgiving, Christmas and the like.
            </p>
          )}
        </div>
      </section>

      {picked && <EventCard key={picked.id} event={picked} site={site} onEdit={() => setDialog('edit')} onDeleted={() => setPickedId(null)} />}

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
    </div>
  );
}

// ---- One event's guest list ------------------------------------------------------------------

function EventCard({ event: e, site, onEdit, onDeleted }: { event: DiningEvent; site: Site; onEdit: () => void; onDeleted: () => void }) {
  const data = useStore((s) => s.data);
  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<'list' | 'seats'>('list');
  const list = E.guestList(data, e);
  const t = E.eventTotals(data, e);
  const over = t.people - t.seats;

  const needle = q.trim().toLowerCase();
  const match = (first: string, last: string, nick: string | null) => !needle || `${first} ${last} ${nick ?? ''}`.toLowerCase().includes(needle);
  const shown = list.filter((a) => match(a.resident.first, a.resident.last, a.resident.nickname));
  const coming = shown.filter((a) => a.status === 'coming');
  const cancelled = shown.filter((a) => a.status === 'cancelled');
  // Typing a name also offers residents who aren't on the list yet.
  const onList = new Set(e.attendees.map((a) => a.residentId));
  const addable = needle ? data.residents.filter((r) => r.siteId === site.id && !r.archived && !onList.has(r.id) && match(r.first, r.last, r.nickname)).slice(0, 8) : [];

  const label = (txt: string) => `${txt} · ${e.name}`;

  return (
    <section
      className="card"
      style={{
        flex: '999 1 520px',
        minWidth: 0,
        height: PANEL_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{e.name}</h2>
            <div style={{ fontSize: 13, color: '#4B5563', marginTop: 3 }}>
              {eventDate(e.date)} · {e.meal}
            </div>
          </div>
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <Stat big value={t.people} label="coming" />
          <Stat value={t.residents} label={t.residents === 1 ? 'resident' : 'residents'} />
          <Stat value={t.guests} label={t.guests === 1 ? 'guest' : 'guests'} />
          <Stat value={t.seats} label="seats" warn={over > 0 ? `${over} over` : undefined} />
          {t.cancelled > 0 && <Stat value={t.cancelled} label="cancelled" />}
          <div style={{ flex: '1 1 0' }} />
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

        {tab === 'list' && (
          <div style={{ position: 'relative', marginTop: 14 }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ position: 'absolute', left: 11, top: 12 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="search"
              aria-label="Find or add a resident"
              placeholder="Find or add a resident"
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 40,
                padding: '0 12px 0 34px',
                border: 0,
                background: '#F1F3F5',
                borderRadius: 10,
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#111827',
              }}
            />
          </div>
        )}
      </div>

      {tab === 'seats' ? (
        <EventSeating event={e} site={site} />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {addable.length > 0 && (
            <Group title="Add to the list">
              {addable.map((r) => (
                <Row key={r.id} name={fullName(r)} tags={r.onPlan.includes(e.meal) ? [] : ['Not on plan']}>
                  <button type="button" className="btn sm" onClick={() => act(label(`Add ${fullName(r)}`), E.addToEvent(e.id, r.id)).then(() => setQ(''))}>
                    + Add
                  </button>
                </Row>
              ))}
            </Group>
          )}

          {(coming.length > 0 || !needle) && (
            <Group title={`Coming (${coming.length})`}>
              {coming.map((a) => {
                const name = fullName(a.resident);
                return (
                  <Row key={a.residentId} name={name} tags={[...(a.added ? ['Added'] : []), ...(a.onPlan ? [] : ['Not on plan'])]}>
                    <Guests n={a.guests} name={name} onSet={(n) => act(label(`${name}: ${n} ${n === 1 ? 'guest' : 'guests'}`), E.setGuests(e.id, a.residentId, n))} />
                    {a.added ? (
                      <button type="button" className="btn sm" style={{ width: 84 }} onClick={() => act(label(`Remove ${name}`), E.removeFromEvent(e.id, a.residentId))}>
                        Remove
                      </button>
                    ) : (
                      <button type="button" className="btn sm" style={{ width: 84 }} onClick={() => act(label(`${name} cancelled`), E.setAttendeeStatus(e.id, a.residentId, 'cancelled'))}>
                        Cancel
                      </button>
                    )}
                  </Row>
                );
              })}
              {coming.length === 0 && <Empty text="No one is coming yet. Find a resident above to add them." />}
            </Group>
          )}
          {needle && !coming.length && !cancelled.length && !addable.length && <Empty text="No resident matches." />}

          {cancelled.length > 0 && (
            <Group title={`Cancelled (${cancelled.length})`}>
              {cancelled.map((a) => {
                const name = fullName(a.resident);
                return (
                  <Row key={a.residentId} name={name} dim tags={a.onPlan ? [] : ['Not on plan']}>
                    <button type="button" className="btn sm" style={{ width: 84 }} onClick={() => act(label(`${name} coming`), E.setAttendeeStatus(e.id, a.residentId, 'coming'))}>
                      Coming
                    </button>
                  </Row>
                );
              })}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({ value, label, big, warn }: { value: number; label: string; big?: boolean; warn?: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 5,
        padding: '6px 12px',
        borderRadius: 8,
        background: warn ? '#FEF2F2' : big ? '#EFF6FF' : '#F3F4F6',
        border: `1px solid ${warn ? '#FCA5A5' : big ? '#BFDBFE' : '#E5E7EB'}`,
      }}
    >
      <span style={{ fontSize: big ? 18 : 15, fontWeight: 700, color: '#111827' }}>{value}</span>
      <span style={{ fontSize: 13, color: '#4B5563' }}>{label}</span>
      {warn && <span style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C' }}>· {warn}</span>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          padding: '6px 24px',
          background: '#F7F8FA',
          borderBottom: '1px solid #EEF0F3',
          fontSize: 12,
          fontWeight: 700,
          color: '#4B5563',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ name, tags, dim, children }: { name: string; tags: string[]; dim?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
        padding: '6px 24px',
        borderBottom: '1px solid #F0F1F3',
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: dim ? '#9CA3AF' : '#111827',
            textDecoration: dim ? 'line-through' : undefined,
          }}
        >
          {name}
        </span>
        {tags.map((t) => (
          <span
            key={t}
            style={{
              padding: '1px 7px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 600,
              background: t === 'Added' ? '#DBEAFE' : '#FEF3C7',
              color: t === 'Added' ? '#1E40AF' : '#92400E',
            }}
          >
            {t}
          </span>
        ))}
      </span>
      {children}
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
      <span style={{ fontSize: 13, color: '#4B5563', marginRight: 2 }}>Guests</span>
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

const Empty = ({ text }: { text: string }) => <p style={{ margin: 0, padding: '20px 24px', fontSize: 14, color: '#4B5563' }}>{text}</p>;

// ---- New / edit ------------------------------------------------------------------------------

function EventDialog({ site, event, onClose, onSaved }: { site: Site; event?: DiningEvent; onClose: () => void; onSaved: (id: string) => void }) {
  const data = useStore((s) => s.data);
  const meals = site.meals.map((m) => m.meal);
  const [name, setName] = useState(event?.name ?? `Thanksgiving ${new Date().getFullYear()}`);
  const [date, setDate] = useState(event?.date ?? localDate());
  const [meal, setMeal] = useState<MealName>(event?.meal ?? (meals.includes('Dinner') ? 'Dinner' : meals[0]!));
  const regulars = data.residents.filter((r) => r.siteId === site.id && !r.archived && r.attends.includes(meal)).length;

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
