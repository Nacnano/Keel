import { useMemo } from 'react';
import { jamStore } from '@/state/jamStore';
import { isMockMode, useMockInput } from './useMockInput';
import type { JamInput } from './useMockInput';

/**
 * TODO(integration): replace with the real input hook (mic + MIDI + analysis engine feeding
 * jamStore.applyEvent). Until then Start explains how to reach the demo.
 */
function useLiveInputPlaceholder(): JamInput {
  return useMemo(
    () => ({
      start() {
        jamStore
          .getState()
          .setStatus(
            'error',
            'Live input is not connected in this build yet. Add ?mock=1 to the address to try the demo.',
          );
      },
      stop() {
        jamStore.getState().stopSession();
      },
    }),
    [],
  );
}

export function useJamInput(): JamInput & { mock: boolean } {
  const mock = useMemo(() => isMockMode(), []);
  const mockInput = useMockInput();
  const live = useLiveInputPlaceholder();
  return { ...(mock ? mockInput : live), mock };
}
