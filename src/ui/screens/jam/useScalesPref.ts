import { useCallback, useEffect, useState } from 'react';

export const SCALES_PREF_KEY = 'jamkey.ui.scales';

function readPref(): boolean | null {
  try {
    const v = localStorage.getItem(SCALES_PREF_KEY);
    return v === null ? null : v !== '0';
  } catch {
    return null;
  }
}

/**
 * Scale-helper visibility, persisted like the piano pref. Until the user toggles it, it
 * follows `defaultOpen` (open on wide screens, hidden on narrow ones).
 */
export function useScalesPref(defaultOpen: boolean): [open: boolean, toggle: () => void] {
  const [stored, setStored] = useState<boolean | null>(readPref);
  const open = stored ?? defaultOpen;

  useEffect(() => {
    if (stored === null) return;
    try {
      localStorage.setItem(SCALES_PREF_KEY, stored ? '1' : '0');
    } catch {
      /* private mode: ignore */
    }
  }, [stored]);

  const toggle = useCallback(() => setStored((v) => !(v ?? defaultOpen)), [defaultOpen]);
  return [open, toggle];
}
