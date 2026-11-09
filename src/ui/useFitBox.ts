import { useCallback, useEffect, useRef, useState } from 'react';

export interface FitBox {
  /** Content width of the element. */
  w: number;
  /** Height from the element's top to the bottom of the window, minus `bottom`. */
  h: number;
}

/**
 * The space a diagram can fill without the page scrolling: its container's width, and
 * the window height below the container's top edge. `bottom` reserves room for whatever
 * sits under the diagram (card and page padding). Returns [callback ref, box]; w is 0
 * until measured.
 */
export function useFitBox<T extends HTMLElement>(bottom: number): [(el: T | null) => void, FitBox] {
  const [box, setBox] = useState<FitBox>({ w: 0, h: 0 });
  const el = useRef<T | null>(null);
  const ro = useRef<ResizeObserver | null>(null);

  const measure = useCallback(() => {
    const node = el.current;
    if (!node) return;
    const w = Math.round(node.clientWidth - parseFloat(getComputedStyle(node).paddingLeft) - parseFloat(getComputedStyle(node).paddingRight));
    const top = node.getBoundingClientRect().top + window.scrollY;
    const h = Math.max(0, Math.round(window.innerHeight - top - bottom));
    setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
  }, [bottom]);

  const ref = useCallback(
    (node: T | null) => {
      ro.current?.disconnect();
      ro.current = null;
      el.current = node;
      if (!node || typeof ResizeObserver === 'undefined') return;
      ro.current = new ResizeObserver(measure);
      ro.current.observe(node);
      // Things above the diagram (tabs wrapping, banners) move its top edge.
      ro.current.observe(document.body);
      measure();
    },
    [measure],
  );

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return [ref, box];
}
