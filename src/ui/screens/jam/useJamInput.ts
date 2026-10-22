import { useEffect, useMemo } from 'react';
import { liveInput } from '@/app/live/liveInput';
import { isMockMode, useMockInput } from './useMockInput';
import type { JamInput } from './useMockInput';

function useLiveInput(): JamInput {
  useEffect(() => {
    void liveInput().refreshDevices();
  }, []);
  return useMemo(
    () => ({
      start: () => liveInput().start(),
      stop: () => liveInput().stop(),
    }),
    [],
  );
}

/** Mock stream under `?mock=1`, otherwise the real mic + MIDI + analysis pipeline. */
export function useJamInput(): JamInput & { mock: boolean } {
  const mock = useMemo(() => isMockMode(), []);
  const mockInput = useMockInput();
  const live = useLiveInput();
  return { ...(mock ? mockInput : live), mock };
}
