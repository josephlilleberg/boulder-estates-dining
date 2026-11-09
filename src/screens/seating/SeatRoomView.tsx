import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { hasAlert } from '../../domain/model';
import { AlertBadge } from '../../sheets/SheetPage';
import type { SeatKey, SeatLabel, SeatRoom } from './model';

interface Props {
  room: SeatRoom;
  selectedKey: SeatKey | null;
  /** Placing someone (Move seat): empty seats turn blue and say "Seat here". */
  picking: boolean;
  onSeatClick: (lab: SeatLabel) => void;
  /** A name was dragged onto another seat. */
  onDrop: (residentId: string, target: SeatKey) => void;
  /** The "Who sits here?" pop-up, positioned in room pixels by the parent. */
  children?: ReactNode;
}

interface Drag {
  key: SeatKey;
  residentId: string;
  name: string;
  pointer: number;
  sx: number;
  sy: number;
  moved: boolean;
}

const seatAt = (x: number, y: number): SeatKey | null => {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-seat]');
  return el?.dataset.seat ?? null;
};

// The section drawn to scale: tables, names against the table edge, "+" circles
// on empty seats. Names drag with the pointer (not HTML5 drag and drop, which the
// Windows webview hands to the app shell for file drops).
export function SeatRoomView({ room, selectedKey, picking, onSeatClick, onDrop, children }: Props) {
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number; over: SeatKey | null } | null>(null);
  const placing = picking || !!ghost;

  const down = (lab: SeatLabel) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !lab.resident) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { key: lab.key, residentId: lab.resident.id, name: lab.name, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
  };

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (!g.moved && Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) < 5) return; // a click, not a drag
    g.moved = true;
    const over = seatAt(e.clientX, e.clientY);
    setGhost({ name: g.name, x: e.clientX, y: e.clientY, over: over === g.key ? null : over });
  };

  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    drag.current = null;
    setGhost(null);
    if (!g.moved) return;
    justDragged.current = true; // swallow the click that follows pointerup
    const target = e.type === 'pointerup' ? seatAt(e.clientX, e.clientY) : null;
    if (target && target !== g.key) onDrop(g.residentId, target);
  };

  return (
    <div style={{ position: 'relative', width: room.w, height: room.h, background: '#FFFFFF', border: '1.5px solid #9CA3AF', borderRadius: 10, flex: 'none', userSelect: 'none' }}>
      {room.tables.map((t) => (
        <div
          key={t.id}
          className="tbl"
          aria-hidden="true"
          style={{ left: t.l, top: t.t, width: t.w, height: t.h, borderRadius: t.radius, transform: `rotate(${t.rotation}deg)`, background: '#FFFFFF', border: '1.5px solid #4B5563' }}
        >
          <div style={{ transform: `rotate(${-t.rotation}deg)`, fontSize: t.fontSize, fontWeight: 700, color: '#1F2937', lineHeight: 1 }}>{t.number}</div>
        </div>
      ))}
      {room.labels.map((lab) => {
        const r = lab.resident;
        const sel = lab.key === selectedKey || lab.key === ghost?.over;
        const D = placing ? 20 : 16;
        const box = r ? lab : { ...lab, l: lab.l + lab.w / 2 - D / 2, t: lab.t + lab.h / 2 - D / 2, w: D, h: D };
        return (
          <button
            key={lab.key}
            type="button"
            className="seatlab"
            data-seat={lab.key}
            aria-label={r ? `${r.first} ${r.last}, table ${lab.tableNumber}` : placing ? `Seat here, table ${lab.tableNumber}` : `Empty seat at table ${lab.tableNumber}`}
            onPointerDown={down(lab)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false;
                return;
              }
              onSeatClick(lab);
            }}
            style={{
              left: box.l,
              top: box.t,
              width: box.w,
              height: box.h,
              transform: `rotate(${lab.angle}deg)`,
              background: sel ? '#DBEAFE' : !r && placing ? '#DBEAFE' : !r ? '#FFFFFF' : 'transparent',
              border: sel ? '1px solid #93C5FD' : r ? '1px solid transparent' : placing ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
              borderRadius: r ? 6 : '50%',
              color: r ? '#111827' : placing ? '#1D4ED8' : '#9CA3AF',
              fontWeight: r ? 600 : 500,
              fontSize: lab.fontSize,
              touchAction: r ? 'none' : undefined,
              cursor: r ? (ghost ? 'grabbing' : 'pointer') : 'pointer',
              opacity: ghost && drag.current?.key === lab.key ? 0.4 : 1,
            }}
          >
            {r ? (
              <>
                {hasAlert(r) && <AlertBadge size={Math.max(10, lab.fontSize - 1)} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', marginLeft: hasAlert(r) ? 3 : 0 }}>{lab.name}</span>
              </>
            ) : (
              <svg viewBox="0 0 10 10" width={placing ? 10 : 8} height={placing ? 10 : 8} aria-hidden="true" style={{ display: 'block' }}>
                <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        );
      })}
      {children}
      {ghost && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: ghost.x + 10,
            top: ghost.y + 8,
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
          {ghost.name}
        </div>
      )}
    </div>
  );
}
