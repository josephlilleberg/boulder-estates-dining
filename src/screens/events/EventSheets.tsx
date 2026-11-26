import type { ReactNode } from 'react';
import type { DiningEvent } from '../../domain/model';
import type { AppData } from '../../db/repo';
import type { Site } from '../../domain/sites';
import { eventSheets } from '../../sheets/eventSheets';
import { PAGE } from '../../sheets/model';
import { PrintDialog } from '../../sheets/PrintDialog';
import { SheetPage } from '../../sheets/SheetPage';
import { sheetDay } from '../../sheets/useSheets';
import * as E from '../../state/eventActions';
import { chunk } from '../mealplan/plan';

// The event's two printouts, each shown in a pop-up with Print:
// - Cancellations & additions: who's cancelled and who's added (with guests and totals).
// - Resident sheet: everyone coming, A–Z, with guests and each party's total.
// And the Setup and Server sheets, from the arranged seats (see sheets/eventSheets.ts).

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
    added: list.filter(E.inAdditions).map(rowOf),
  };
}

export function EventSheetDialog({ kind, event: e, data, dateText, onClose }: { kind: EventSheet; event: DiningEvent; data: AppData; dateText: string; onClose: () => void }) {
  const lists = eventLists(data, e);
  const total = mealTotal(lists.coming);
  const sub = `${dateText} · ${e.meal}`;
  const title = kind === 'overview' ? 'Cancellations & additions' : 'Resident sheet';
  const pages =
    kind === 'overview'
      ? overviewPages({ title: e.name, sub, total, cancelled: lists.cancelled, added: lists.added })
      : residentPages({ title: e.name, sub, total, rows: lists.coming });

  return (
    <PrintDialog
      title={title}
      subtitle={`${e.name} · ${sub}`}
      items={pages.map((el, i) => ({ key: String(i), label: pages.length > 1 ? `${title}, page ${i + 1}` : title, w: W, h: H, render: () => el }))}
      note={
        <>
          Total for meal <b style={{ color: '#111827' }}>{total}</b> · Total cancellations <b style={{ color: '#111827' }}>{lists.cancelled.length}</b>
        </>
      }
      onClose={onClose}
    />
  );
}

/** The Setup and Server sheets for the event's arranged seats. */
export function EventServerSheetsDialog({ event: e, site, data, onClose }: { event: DiningEvent; site: Site; data: AppData; onClose: () => void }) {
  const day = sheetDay(new Date(`${e.date}T00:00`));
  const ev = eventSheets(data, site, e, day);
  if (!ev) return null;
  return (
    <PrintDialog
      title="Setup & server sheets"
      subtitle={`${e.name} · ${day} · ${e.meal}`}
      items={ev.sheets.map((s) => ({ key: s.key, label: s.printLabel, sub: s.sub, ...PAGE[s.paper], render: () => <SheetPage page={ev.page(s)} shadow={false} /> }))}
      note={ev.extra ? `${ev.extra} in extra places past a table's seats aren't on the sheets` : 'From the arranged seats; a guest prints as “+ Kim A.” beside Kim A.'}
      onClose={onClose}
    />
  );
}

function Page({ title, sub, heading, page, pages, children }: { title: string; sub: string; heading: string; page: number; pages: number; children: ReactNode }) {
  return (
    <div className="sheet-page" style={{ width: W, height: H, boxSizing: 'border-box', padding: `${PAD - 8}px ${PAD}px`, background: '#FFFFFF', color: '#111827', position: 'relative', fontFamily: 'Inter, system-ui, sans-serif' }}>
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

function residentPages({ title, sub, total, rows }: { title: string; sub: string; total: number; rows: Row[] }) {
  const chunks = chunk(rows, SHEET_ROWS * 2);
  const pages = chunks.length ? chunks : [[]];
  return pages.map((p, i) => (
    <Page key={i} title={title} sub={sub} heading={`Residents coming (${rows.length})`} page={i + 1} pages={pages.length}>
      {i === 0 && <Totals total={total} />}
      <div style={COLUMNS}>
        {chunk(p, SHEET_ROWS).map((col, ci) => (
          <RowTable key={ci} rows={col} />
        ))}
      </div>
    </Page>
  ));
}

function overviewPages({ title, sub, total, cancelled, added }: { title: string; sub: string; total: number; cancelled: Row[]; added: Row[] }) {
  const c = chunk(cancelled, OVERVIEW_ROWS);
  const a = chunk(added, OVERVIEW_ROWS);
  const n = Math.max(1, c.length, a.length);
  const none = (text: string) => <p style={{ fontSize: 13, color: '#4B5563', margin: 0 }}>{text}</p>;
  return Array.from({ length: n }, (_, i) => (
    <Page key={i} title={title} sub={sub} heading="Cancellations & additions" page={i + 1} pages={n}>
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
  ));
}
