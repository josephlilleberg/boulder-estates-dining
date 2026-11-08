import { useRef, useState, type PointerEvent } from 'react';
import type { DiningTable } from '../../domain/model';
import { clampX, clampY, ROOM_H, ROOM_W, seatPoints, snap, tableSize } from '../../domain/room';

interface Props {
  tables: DiningTable[];
  scale: number;
  selectedId: string | null;
  warnings: Map<string, string>;
  onSelect: (id: string) => void;
  /** Called once when a drag ends; the table is drawn at the dragged spot until the save lands. */
  onMove: (id: string, x: number, y: number) => Promise<unknown>;
}

interface Drag {
  id: string;
  pointer: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
}

// Dotted-grid canvas with tables and seat circles (mockup room() in design mode).
// Dragging is local state only: one save, and one undo step, per drag.
export function DesignRoom({ tables, scale: sc, selectedId, warnings, onSelect, onMove }: Props) {
  const drag = useRef<Drag | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const dot = Math.max(6, Math.round((12 * sc) / 0.74));

  const placed = tables.map((t) => (live?.id === t.id ? { ...t, x: live.x, y: live.y } : t));

  const down = (t: DiningTable) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: t.id, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false };
    onSelect(t.id);
  };

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = (e.clientX - g.sx) / sc;
    const dy = (e.clientY - g.sy) / sc;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 5) return; // a click, not a drag
    g.moved = true;
    setLive({ id: g.id, x: clampX(snap(g.ox + dx)), y: clampY(snap(g.oy + dy)) });
  };

  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const g = drag.current;
    if (!g || g.pointer !== e.pointerId) return;
    drag.current = null;
    if (!g.moved || !live) return setLive(null);
    const end = live;
    void onMove(end.id, end.x, end.y).finally(() => setLive((cur) => (cur === end ? null : cur)));
  };

  return (
    <div
      style={{
        position: 'relative',
        width: ROOM_W * sc,
        height: ROOM_H * sc,
        backgroundColor: '#FFFFFF',
        backgroundImage: 'radial-gradient(#D7DCE3 1px, transparent 1px)',
        backgroundSize: '15px 15px',
        border: '1.5px solid #9CA3AF',
        borderRadius: 10,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {placed.flatMap((t) =>
        seatPoints(t).map((p, i) => (
          <div
            key={`${t.id}:${i}`}
            style={{ position: 'absolute', left: p.x * sc - dot / 2, top: p.y * sc - dot / 2, width: dot, height: dot, borderRadius: '50%', boxSizing: 'border-box', background: '#FFFFFF', border: '1.5px solid #6B7280' }}
          />
        )),
      )}
      {placed.map((t) => {
        const round = t.shape === 'round';
        const [w, h] = tableSize(t.shape).map((v) => v * sc) as [number, number];
        const sel = t.id === selectedId;
        const warn = warnings.has(t.id);
        return (
          <button
            key={t.id}
            type="button"
            className="tbl"
            aria-label={`Table ${t.number}, ${round ? 'round' : 'rectangle'}`}
            aria-pressed={sel}
            onPointerDown={down(t)}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onClick={() => onSelect(t.id)}
            style={{
              left: t.x * sc - w / 2,
              top: t.y * sc - h / 2,
              width: w,
              height: h,
              borderRadius: round ? '50%' : `${Math.max(3, Math.round(8 * sc))}px`,
              transform: `rotate(${t.rotation}deg)`,
              background: sel ? '#EFF6FF' : '#FFFFFF',
              border: warn ? '2.5px solid #EA580C' : sel ? '2.5px solid #2563EB' : '1.5px solid #4B5563',
              cursor: live?.id === t.id ? 'grabbing' : 'grab',
            }}
          >
            <span style={{ display: 'block', transform: `rotate(${-t.rotation}deg)`, fontSize: Math.round(22 * sc), fontWeight: 700, color: '#1F2937', lineHeight: 1 }}>{t.number}</span>
          </button>
        );
      })}
    </div>
  );
}
