import { useCallback, useEffect, useState } from 'react';
import type { InspectorTab } from './JamInspector';

const KEY = 'keel.ui.inspector';
const TABS: InspectorTab[] = ['next', 'scales', 'voicings', 'keys'];

function read(): { open: boolean; tab: InspectorTab } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { open: false, tab: 'next' };
    const [o, t] = raw.split(':');
    return {
      open: o === '1',
      tab: TABS.includes(t as InspectorTab) ? (t as InspectorTab) : 'next',
    };
  } catch {
    return { open: false, tab: 'next' };
  }
}

/** Inspector open state + tab, remembered across sessions. Closed by default. */
export function useInspectorPref() {
  const [state, setState] = useState(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, `${state.open ? '1' : '0'}:${state.tab}`);
    } catch {
      /* private mode */
    }
  }, [state]);
  const setOpen = useCallback((open: boolean) => setState((s) => ({ ...s, open })), []);
  const setTab = useCallback((tab: InspectorTab) => setState({ open: true, tab }), []);
  /** Toggle: opens on `tab`, closes if already open on it. */
  const toggleTab = useCallback(
    (tab: InspectorTab) =>
      setState((s) => (s.open && s.tab === tab ? { ...s, open: false } : { open: true, tab })),
    [],
  );
  return { ...state, setOpen, setTab, toggleTab };
}
