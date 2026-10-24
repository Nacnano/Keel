import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A flag that turns itself off after `ms`: a button says "Copied" in place for a moment
 * instead of a toast elsewhere on the screen.
 */
export function useFlash(ms = 1500): [on: boolean, flash: () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const flash = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);
  return [on, flash];
}
