import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

export interface Size {
  width: number;
  height: number;
}

/** Content-box size of an element, kept current with ResizeObserver (0×0 where unsupported). */
export function useElementSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (width: number, height: number) =>
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    update(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) update(Math.round(r.width), Math.round(r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
