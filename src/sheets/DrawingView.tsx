import { useLayoutEffect, useRef, useState } from 'react';
import type { PageData } from './pages';
import { SheetPage } from './SheetPage';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGIN = 10; // breathing room around the drawing, in page pixels

/**
 * A sheet cropped to its drawing (tables, labels, section titles), so it
 * fills the screen without the paper's margins, title strip and empty space. View only;
 * printing always uses the whole page. Sheets without a drawing show the whole page.
 */
export function DrawingView({ page, w, h }: { page: PageData; w: number; h: number }) {
  const probe = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<{ page: PageData; r: Rect } | null>(null);

  // Measure the drawing at full size (in a hidden copy), then crop to it.
  useLayoutEffect(() => {
    const root = probe.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    // Tables, labels and section titles; not the full-height section dividers, and not the
    // chair key (View shows that underneath at full size).
    const parts = [...root.querySelectorAll<HTMLElement>('[data-sheet-room] *')].filter((el) => !el.hasAttribute('data-sheet-divider') && getComputedStyle(el).position === 'absolute');
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const el of parts) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    const r = Number.isFinite(x0)
      ? { x: Math.max(0, x0 - base.left - MARGIN), y: Math.max(0, y0 - base.top - MARGIN), w: Math.min(page.w, x1 - x0 + 2 * MARGIN), h: Math.min(page.h, y1 - y0 + 2 * MARGIN) }
      : { x: 0, y: 0, w: page.w, h: page.h };
    setCrop({ page, r });
  }, [page]);

  const r = crop?.page === page ? crop.r : null;
  const k = r ? Math.max(0.1, Math.min(1.6, w / r.w, h / r.h)) : 0;

  return (
    <>
      <div ref={probe} aria-hidden="true" style={{ position: 'fixed', left: -100000, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
        <SheetPage page={page} shadow={false} />
      </div>
      {r && (
        <div style={{ width: Math.round(r.w * k), height: Math.round(r.h * k), margin: '0 auto', position: 'relative', overflow: 'hidden', background: '#FFFFFF', borderRadius: 4, boxShadow: '0 2px 10px rgba(0,0,0,.18)' }}>
          <div style={{ position: 'absolute', left: -r.x * k, top: -r.y * k, transform: `scale(${k})`, transformOrigin: '0 0' }}>
            <SheetPage page={page} shadow={false} />
          </div>
        </div>
      )}
    </>
  );
}
