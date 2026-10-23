import { useCallback, useEffect, useState } from 'react';
import type { InspectorTab } from './JamInspector';

const KEY = 'keel.ui.inspector';
const TABS: InspectorTab[] = ['next', 'scales', 'voicings', 'keys'];

/** Only the tab is restored: Ideas always starts closed so it never covers a new session. */
function readTab(): InspectorTab {
  try {
    const t = localStorage.getItem(KEY)?.split(':')[1];
    return TABS.includes(t as InspectorTab) ? (t as InspectorTab) : 'next';
  } catch {
    return 'next';
  }
}

/** Ideas open state (closed on every visit) and the last tab (remembered). */
export function useInspectorPref() {
  const [state, setState] = useState(() => ({ open: false, tab: readTab() }));
  useEffect(() => {
    try {
      // Same `open:tab` format as before, so older builds keep reading it.
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
