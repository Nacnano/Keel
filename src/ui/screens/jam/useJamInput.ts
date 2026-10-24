import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { liveInput } from '@/app/live/liveInput';
import { isDemoRunning, isMockMode, useMockInput } from './useMockInput';

export function useJamInput() {
  const [search, setSearch] = useSearchParams();
  // Coming back to a demo that kept playing on another screen keeps its demo controls.
  const [mock, setMock] = useState(
    () => isMockMode(search.toString()) || isMockMode() || isDemoRunning(),
  );
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { start: playDemo, stop: stopDemo } = useMockInput();

  const switchMode = useCallback(
    (demo: boolean) => {
      setMock(demo);
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          if (demo) next.set('mock', '1');
          else next.delete('mock');
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  const prepare = useCallback(() => {
    setFinished(false);
    setSaved(null);
    setSaveError(null);
  }, []);

  const startLive = useCallback(() => {
    stopDemo();
    switchMode(false);
    prepare();
    return liveInput().start();
  }, [stopDemo, switchMode, prepare]);

  const startDemo = useCallback(() => {
    switchMode(true);
    prepare();
    playDemo();
  }, [playDemo, switchMode, prepare]);

  const start = mock ? startDemo : startLive;
  const stop = useCallback(async () => {
    if (mock) {
      stopDemo();
      setFinished(true);
      return;
    }
    setSaving(true);
    try {
      // The finished screen confirms the save, so no extra toast.
      await liveInput().stop({
        onSaved: setSaved,
        onSaveError: setSaveError,
      });
      setFinished(true);
    } finally {
      setSaving(false);
    }
  }, [mock, stopDemo]);

  /** "New song": the live key is re-found from what comes next (the demo is scripted). */
  const newSong = useCallback(() => {
    if (!mock) liveInput().newSong();
  }, [mock]);

  return { start, stop, startLive, startDemo, newSong, mock, saving, finished, saved, saveError };
}
