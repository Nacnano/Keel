import { useEffect, useLayoutEffect, useRef } from 'react';
import type { VocabLevel } from '@/core';

export interface JamShortcutHandlers {
  toggleListening(): void;
  reset(): void;
  bookmark(): void;
  setLevel(level: VocabLevel): void;
  togglePiano(): void;
  toggleMode(): void;
  /** S: show / hide the scale helper. */
  toggleScales?(): void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/** Space start/stop, R reset, B bookmark, 1/2/3 level, K piano, M mode, S scales. */
export function useJamShortcuts(handlers: JamShortcutHandlers) {
  const ref = useRef(handlers);
  useLayoutEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const h = ref.current;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (k) {
        case ' ':
          e.preventDefault();
          // Stop a focused button from also activating on keyup.
          if (e.target instanceof HTMLButtonElement) e.target.blur();
          if (!e.repeat) h.toggleListening();
          return;
        case 'r':
          h.reset();
          return;
        case 'b':
          h.bookmark();
          return;
        case '1':
        case '2':
        case '3':
          h.setLevel(Number(k) as VocabLevel);
          return;
        case 'k':
          h.togglePiano();
          return;
        case 'm':
          h.toggleMode();
          return;
        case 's':
          h.toggleScales?.();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
