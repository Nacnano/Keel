import { useEffect, useLayoutEffect, useRef } from 'react';

export interface ReviewShortcutHandlers {
  toggle(): void;
  skip(seconds: number): void;
  bookmark(): void;
  zoom(factor: number): void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/** Space play/pause, ←/→ skip 5 s (Shift = 1 s), B bookmark, +/- zoom. */
export function useReviewShortcuts(handlers: ReviewShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const h = ref.current;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (k) {
        case ' ':
          e.preventDefault();
          if (e.target instanceof HTMLButtonElement) e.target.blur();
          if (!e.repeat) h.toggle();
          return;
        case 'ArrowLeft':
        case 'ArrowRight':
          // Lane items (markers) use arrows themselves and stop propagation.
          e.preventDefault();
          h.skip((e.shiftKey ? 1 : 5) * (k === 'ArrowLeft' ? -1 : 1));
          return;
        case 'b':
          if (!e.repeat) h.bookmark();
          return;
        case '+':
        case '=':
          h.zoom(1.5);
          return;
        case '-':
        case '_':
          h.zoom(1 / 1.5);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
