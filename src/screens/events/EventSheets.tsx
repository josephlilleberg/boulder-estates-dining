import { useState, type ReactNode } from 'react';
import type { DiningEvent } from '../../domain/model';
import type { AppData } from '../../db/repo';
import { printOn } from '../../sheets/print';
import * as E from '../../state/eventActions';
import { Dialog } from '../../ui/Dialog';
import { chunk } from '../mealplan/plan';

// The event's two printouts, each shown in a pop-up with Print:
// - Overview: who's cancelled and who's added (with guests and totals).
// - Resident sheet: everyone coming, A–Z, with guests and each party's total.

const W = 816; // Letter, portrait
const H = 1056;
const PAD = 40;
const ROW_H = 22;
const SHEET_ROWS = 38; // per column; two columns a page
const OVERVIEW_ROWS = 38;

export type EventSheet = 'overview' | 'residents';

interface Row {
  id: string;
  name: string;
  guests: number;
}

const nameOf = (a: E.ListedAttendee) => `${a.resident.last}, ${a.resident.first}`;
const rowOf = (a: E.ListedAttendee): Row => ({ id: a.residentId, name: nameOf(a), guests: a.guests });

/** Everyone eating: residents coming plus their guests. */
export const mealTotal = (rows: { guests: number }[]) => rows.reduce((n, r) => n + 1 + r.guests, 0);

export function eventLists(data: AppData, e: DiningEvent) {
  const list = E.guestList(data, e);
  const coming = list.filter((a) => a.status === 'coming');
  return {
    coming: coming.map(rowOf),
    cancelled: list.filter((a) => a.status === 'cancelled').map(rowOf),
    added: coming.filter((a) => a.added || a.guests > 0).map(rowOf),
  };
}

export function EventSheetDialog({ kind, event: e, data, dateText, onClose }: { kind: EventSheet; event: DiningEvent; data: AppData; dateText: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const lists = eventLists(data, e);
  const total = mealTotal(lists.coming);
  const sub = `${dateText} · ${e.meal}`;
  const title = kind === 'overview' ? 'Overview' : 'Resident sheet';

  const pages = (shadow: boolean) =>
    kind === 'overview' ? (
      <OverviewPages title={e.name} sub={sub} total={total} cancelled={lists.cancelled} added={lists.added} shadow={shadow} />
    ) : (
      <ResidentPages title={e.name} sub={sub} total={total} rows={lists.coming} shadow={shadow} />
    );

  const print = async () => {
    setBusy(true);
    try {
      await printOn('letter', pages(false));
    } finally {
      setBusy(false);
    }
  };

  const width = Math.min(760, window.innerWidth - 32);
  const k = Math.min(1, (width - 40) / W);
  return (
    <Dialog
      title={title}
      subtitle={`${e.name} · ${sub}`}
      onClose={onClose}
      width={width}
      footer={
        <>
          <span style={{ fontSize: 13, color: '#4B5563' }}>
            Total for meal <b style={{ color: '#111827' }}>{total}</b> · Total cancellations <b style={{ color: '#111827' }}>{lists.cancelled.length}</b>
          </span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void print()} title="Opens the print dialog; choose Save as PDF there for a file">
            Print
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '4px 0 8px', zoom: k }}>{pages(true)}</div>
    </Dialog>
  );
}

function Page({ title, sub, heading, page, pages, shadow, children }: { title: string; sub: string; heading: string; page: number; pages: number; shadow: boolean; children: ReactNode }) {
  return (
    <div className="sheet-page" style={{ width: W, height: H, boxSizing: 'border-box', padding: `${PAD - 8}px ${PAD}px`, background: '#FFFFFF', color: '#111827', boxShadow: shadow ? '0 2px 10px rgba(0,0,0,.18)' : undefined, position: 'relative', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, paddingBottom: 10, borderBottom: '2px solid #111827' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#4B5563', marginTop: 2 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{heading}</div>
      </div>
      {children}
      {pages > 1 && <div style={{ position: 'absolute', right: PAD, bottom: 18, fontSize: 11, color: '#4B5563' }}>Page {page} of {pages}</div>}
    </div>
  );
}

const Totals = ({ total, cancelled }: { total: number; cancelled?: number }) => (
  <div style={{ display: 'flex', gap: 28, marginTop: 12, fontSize: 15 }}>
    <span>
      Total for meal <b>{total}</b>
    </span>
    {cancelled !== undefined && (
      <span>
        Total cancellations <b>{cancelled}</b>
      </span>
    )}
  </div>
);

// Two columns side by side; `start` so a shorter column's rows don't stretch to match the other.
const COLUMNS = { display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'start', gap: 28, marginTop: 14 } as const;

const th = { fontSize: 11, fontWeight: 700, color: '#4B5563', textAlign: 'left' as const, padding: '0 6px', height: ROW_H, borderBottom: '1px solid #9CA3AF', textTransform: 'uppercase' as const, letterSpacing: 0.4 };
const td = { fontSize: 13, padding: '0 6px', height: ROW_H, borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' };
const num = { textAlign: 'right' as const, width: 54 };

/** Name, guests (blank when none) and the party's total; `withParty` false shows just names. */
function RowTable({ rows, withParty = true }: { rows: Row[]; withParty?: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <thead>
        <tr>
          <th style={th}>Name</th>
          {withParty && <th style={{ ...th, ...num }}>Guests</th>}
          {withParty && <th style={{ ...th, ...num }}>Total</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td style={td}>{r.name}</td>
            {withParty && <td style={{ ...td, ...num }}>{r.guests || ''}</td>}
            {withParty && <td style={{ ...td, ...num, fontWeight: 700 }}>{1 + r.guests}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResidentPages({ title, sub, total, rows, shadow }: { title: string; sub: string; total: number; rows: Row[]; shadow: boolean }) {
  const pages = chunk(rows, SHEET_ROWS * 2);
  return (
    <>
      {pages.map((p, i) => (
        <Page key={i} title={title} sub={sub} heading={`Residents coming (${rows.length})`} page={i + 1} pages={pages.length} shadow={shadow}>
          {i === 0 && <Totals total={total} />}
          <div style={COLUMNS}>
            {chunk(p, SHEET_ROWS).map((col, ci) => (
              <RowTable key={ci} rows={col} />
            ))}
          </div>
        </Page>
      ))}
    </>
  );
}

function OverviewPages({ title, sub, total, cancelled, added, shadow }: { title: string; sub: string; total: number; cancelled: Row[]; added: Row[]; shadow: boolean }) {
  const c = chunk(cancelled, OVERVIEW_ROWS);
  const a = chunk(added, OVERVIEW_ROWS);
  const n = Math.max(c.length, a.length);
  const none = (text: string) => <p style={{ fontSize: 13, color: '#4B5563', margin: 0 }}>{text}</p>;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <Page key={i} title={title} sub={sub} heading="Overview" page={i + 1} pages={n} shadow={shadow}>
          {i === 0 && <Totals total={total} cancelled={cancelled.length} />}
          <div style={COLUMNS}>
            <div>
              {i === 0 && <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Cancelled ({cancelled.length})</h3>}
              {c[i]?.length ? <RowTable rows={c[i]!} withParty={false} /> : i === 0 && none('No one has cancelled.')}
            </div>
            <div>
              {i === 0 && <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Added ({added.length})</h3>}
              {a[i]?.length ? <RowTable rows={a[i]!} /> : i === 0 && none('No additions or guests.')}
            </div>
          </div>
        </Page>
      ))}
    </>
  );
}
