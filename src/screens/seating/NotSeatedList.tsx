import { useRef, useState, type PointerEvent } from 'react';
import { fullName, hasAlert, type Resident } from '../../domain/model';
import { AlertBadge } from '../../sheets/SheetPage';
import type { SeatKey } from './model';

interface Props {
  residents: Resident[];
  /** Who's being placed by click (highlighted). */
  placingId: string | null;
  /** Click a name: start placing them (then click any seat). */
  onPick: (residentId: string) => void;
  /** Dragged onto a seat on the map. */
  onDrop: (residentId: string, seat: SeatKey) => void;
}

const seatAt = (x: number, y: number): SeatKey | null => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-seat]')?.dataset.seat ?? null;

// Residents coming to this meal without a seat. Click one to place them, or drag the
// name straight onto a seat. Pointer events, as on the map (the Windows webview takes
// HTML5 drag and drop for files).
export function NotSeatedList({ residents, placingId, onPick, onDrop }: Props) {
  const drag = useRef<{ id: string; sx: number; sy: number; moved: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(null);

  const down = (r: Resident) => (e: PointerEvent<HTMLButtonElement>) => {
    drag.current = { id: r.id, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (r: Resident) => (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    d.moved = true;
    setGhost({ name: fullName(r), x: e.clientX, y: e.clientY });
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) return onPick(d.id);
    const seat = seatAt(e.clientX, e.clientY);
    if (seat) onDrop(d.id, seat);
  };

  return (
    <section className="card" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: residents.length ? 8 : 4 }}>
        Not seated <span style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>{residents.length}</span>
      </div>
      {residents.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Everyone coming to this meal has a seat.</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '32vh', overflowY: 'auto', margin: '0 -6px' }}>
            {residents.map((r) => (
              <button
                key={r.id}
                type="button"
                className={placingId === r.id ? 'rrow on' : 'rrow'}
                style={{ padding: '7px 8px', borderRadius: 6, touchAction: 'none', cursor: ghost ? 'grabbing' : 'grab', gap: 6 }}
                onPointerDown={down(r)}
                onPointerMove={move(r)}
                onPointerUp={up}
                onPointerCancel={() => ((drag.current = null), setGhost(null))}
              >
                {hasAlert(r) && <AlertBadge />}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{fullName(r)}</span>
              </button>
            ))}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6B7280' }}>Drag a name onto a seat, or click it and then a seat.</p>
        </>
      )}
      {ghost && (
        <div style={{ position: 'fixed', left: ghost.x + 12, top: ghost.y + 8, zIndex: 50, pointerEvents: 'none', padding: '4px 10px', borderRadius: 6, background: '#1D4ED8', color: '#FFFFFF', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          {ghost.name}
        </div>
      )}
    </section>
  );
}
