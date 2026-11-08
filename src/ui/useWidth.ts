import { useCallback, useRef, useState } from 'react';

/** Content width of an element, kept current with a ResizeObserver. Returns [callback ref, width or 0]. */
export function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    ro.current = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0);
      if (w) setWidth(w);
    });
    ro.current.observe(el);
  }, []);
  return [ref, width];
}

