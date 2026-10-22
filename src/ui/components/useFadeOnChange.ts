import { useLayoutEffect, useRef } from 'react';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Subtle fade/rise whenever `dep` changes. Uses the Web Animations API, no CSS needed. */
export function useFadeOnChange<T extends HTMLElement>(dep: unknown, durationMs = 180) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || reducedMotion()) return;
    el.animate(
      [
        { opacity: 0.25, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: durationMs, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
  }, [dep, durationMs]);
  return ref;
}
