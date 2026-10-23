import { useEffect, useLayoutEffect, useRef } from 'react';
import type { VocabLevel } from '@/core';

export interface JamShortcutHandlers {
  toggleListening(): void;
  bookmark(): void;
  setLevel(level: VocabLevel): void;
  togglePiano(): void;
  toggleMode(): void;
  /** I: open / close the ideas inspector. */
  toggleInspector?(): void;
  /** N / S / V / K: open the inspector on a tab (toggle if already there). */
  showNext?(): void;
  showScales?(): void;
  showVoicings?(): void;
  showModulate?(): void;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
}

/**
 * Space start/stop · B bookmark · 1/2/3 chord detail · P keyboard · M listening mode ·
 * I ideas · N next · S scales · V voicings · K modulate.
 */
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
          if (e.target instanceof HTMLButtonElement) e.target.blur();
          h.toggleListening();
          break;
        case 'b':
          h.bookmark();
          break;
        case '1':
        case '2':
        case '3':
          h.setLevel(Number(k) as VocabLevel);
          break;
        case 'p':
          h.togglePiano();
          break;
        case 'm':
          h.toggleMode();
          break;
        case 'i':
          h.toggleInspector?.();
          break;
        case 'n':
          h.showNext?.();
          break;
        case 's':
          h.showScales?.();
          break;
        case 'v':
          h.showVoicings?.();
          break;
        case 'k':
          h.showModulate?.();
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
