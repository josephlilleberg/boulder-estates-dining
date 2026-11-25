import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../ui/Dialog';
import { fitPage } from './model';
import { printSized } from './print';

// The app's own print window: tick the pages to print and see each one as it will print, then
// Print hands the ticked pages to the system print dialog (which also offers Save as PDF).

export interface PrintItem {
  key: string;
  label: string;
  sub?: string;
  /** The page at true size (CSS px at 96/in); `w` × `h` is the paper. Called once, when first shown or printed. */
  w: number;
  h: number;
  render: () => ReactNode;
}

const LIST_W = 250;

export function PrintDialog({ title, subtitle, items, note, onClose }: { title: string; subtitle?: string; items: PrintItem[]; note?: ReactNode; onClose: () => void }) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(items[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  // A page is built the first time it's shown (or printed) and kept, so ticking boxes and stepping
  // back and forth doesn't build it again; pages never looked at are built only to print.
  const built = useRef(new Map<string, ReactNode>());
  const pageOf = (i: PrintItem) => {
    if (!built.current.has(i.key)) built.current.set(i.key, i.render());
    return built.current.get(i.key);
  };
  // The rest are built in the background, one at a time, so they're ready when clicked or printed.
  const latest = useRef(items);
  latest.current = items;
  useEffect(() => {
    let timer = 0;
    const next = () => {
      const todo = latest.current.find((i) => !built.current.has(i.key));
      if (!todo) return;
      pageOf(todo);
      timer = window.setTimeout(next, 30);
    };
    timer = window.setTimeout(next, 150);
    return () => clearTimeout(timer);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chosen = items.filter((i) => !off.has(i.key));
  const at = Math.max(0, items.findIndex((i) => i.key === shown));
  const cur = items[at];

  const toggle = (key: string) => {
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOff(next);
  };

  const print = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      // One system print job per paper size: a single job can't reliably feed a printer two sizes.
      const sizes = [...new Set(chosen.map((i) => `${i.w}x${i.h}`))].sort((a, b) => Number(b.split('x')[0]) - Number(a.split('x')[0]));
      for (const size of sizes) {
        const group = chosen.filter((i) => `${i.w}x${i.h}` === size);
        await printSized(group[0]!.w, group[0]!.h, <>{group.map((i) => <Fragment key={i.key}>{pageOf(i)}</Fragment>)}</>);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // The preview fills what the window has: the dialog less the page list, header and footer.
  const width = Math.min(1180, window.innerWidth - 32);
  const boxW = width - LIST_W - 40 - 20;
  const boxH = Math.max(240, window.innerHeight - 32 - 200);
  // Less the grey frame's padding and the page arrows under the page.
  const k = cur ? fitPage(boxW - 20, boxH - 56, cur.w, cur.h) : 1;
  const step = (d: number) => setShown(items[(at + d + items.length) % items.length]!.key);

  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={width}
      footer={
        <>
          {note && <span style={{ fontSize: 13, color: '#4B5563' }}>{note}</span>}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" data-autofocus disabled={!chosen.length || busy} onClick={() => void print()} title="Opens the system print dialog; choose Save as PDF there for a file">
            {busy ? 'Preparing…' : `Print ${chosen.length === 1 ? '1 page' : `${chosen.length} pages`}`}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 20, height: boxH, minHeight: 0 }}>
        <div style={{ width: LIST_W, flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 13, color: '#4B5563' }}>
              {chosen.length} of {items.length} {items.length === 1 ? 'page' : 'pages'}
            </span>
            {items.length > 1 && (
              <>
                <button type="button" className="linkbtn" onClick={() => setOff(new Set())}>
                  All
                </button>
                <button type="button" className="linkbtn" onClick={() => setOff(new Set(items.map((i) => i.key)))}>
                  None
                </button>
              </>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((i, n) => {
              const on = !off.has(i.key);
              const here = i.key === cur?.key;
              return (
                <div key={i.key} onClick={() => setShown(i.key)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${here ? '#2563EB' : '#E5E7EB'}`, background: here ? '#EFF6FF' : '#FFFFFF' }}>
                  <button
                    type="button"
                    className={on ? 'box on' : 'box'}
                    aria-pressed={on}
                    aria-label={`Print ${i.label}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggle(i.key);
                    }}
                    style={{ cursor: 'pointer', padding: 0 }}
                  >
                    <Tick />
                  </button>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: on ? '#111827' : '#6B7280' }}>
                      {items.length > 1 && <span style={{ color: '#6B7280', fontWeight: 500 }}>{n + 1}. </span>}
                      {i.label}
                    </span>
                    {i.sub && <span style={{ display: 'block', fontSize: 12, color: '#4B5563', marginTop: 2 }}>{i.sub}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#F3F4F6', borderRadius: 10, padding: '10px 10px 6px' }}>
          {cur && (
            <>
              <div style={{ position: 'relative', width: Math.round(cur.w * k), height: Math.round(cur.h * k), flex: 'none', boxShadow: '0 2px 10px rgba(0,0,0,.18)', background: '#FFFFFF' }}>
                {/* Scaled as a picture of the page (a transform), so it's laid out exactly as it prints: CSS zoom
                    lets the Mac webview keep small text at a minimum size, which pushed the setup sheet's labels apart. */}
                <div style={{ position: 'absolute', left: 0, top: 0, width: cur.w, height: cur.h, transform: `scale(${k})`, transformOrigin: '0 0', opacity: off.has(cur.key) ? 0.35 : 1 }}>{pageOf(cur)}</div>
                {off.has(cur.key) && (
                  <span style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', padding: '3px 10px', borderRadius: 8, background: '#111827', color: '#FFFFFF', fontSize: 12, fontWeight: 600 }}>Not printing</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 6, fontSize: 13, color: '#4B5563' }}>
                {items.length > 1 && (
                  <button type="button" className="btn sm" aria-label="Previous page" onClick={() => step(-1)}>
                    ‹
                  </button>
                )}
                <span>
                  Page {at + 1} of {items.length}
                </span>
                {items.length > 1 && (
                  <button type="button" className="btn sm" aria-label="Next page" onClick={() => step(1)}>
                    ›
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const Tick = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
