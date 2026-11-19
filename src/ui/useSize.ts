import { useCallback, useRef, useState } from 'react';

/**
 * Content size of an element, kept current with a ResizeObserver. For a box whose size comes
 * from its container (flex: 1 1 0, min-height: 0), not its contents. Returns [callback ref, size].
 */
export function useSize<T extends HTMLElement>(): [(el: T | null) => void, { w: number; h: number }] {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    ro.current = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      const h = Math.round(e?.contentRect.height ?? 0);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.current.observe(el);
  }, []);
  return [ref, size];
}
