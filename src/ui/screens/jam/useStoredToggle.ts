import { useCallback, useEffect, useState } from 'react';

function read(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/** A boolean UI preference persisted in localStorage as '1' / '0'. */
export function useStoredToggle(key: string, fallback = false): [boolean, () => void] {
  const [value, setValue] = useState(() => read(key, fallback));
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? '1' : '0');
    } catch {
      /* private mode: ignore */
    }
  }, [key, value]);
  const toggle = useCallback(() => setValue((v) => !v), []);
  return [value, toggle];
}
