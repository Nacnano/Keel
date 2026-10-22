import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { liveInput } from '@/app/live/liveInput';
import { isMockMode, useMockInput } from './useMockInput';
import type { JamInput } from './useMockInput';

function useLiveInput(): JamInput {
  const navigate = useNavigate();
  useEffect(() => {
    void liveInput().refreshDevices();
  }, []);
  return useMemo(
    () => ({
      start: () => liveInput().start(),
      // The "Saved" toast offers "Open", which jumps to the session's review.
      stop: () => liveInput().stop({ openReview: (id) => void navigate(`/review/${id}`) }),
    }),
    [navigate],
  );
}

/** Mock stream under `?mock=1`, otherwise the real mic + MIDI + analysis pipeline. */
export function useJamInput(): JamInput & { mock: boolean } {
  const mock = useMemo(() => isMockMode(), []);
  const mockInput = useMockInput();
  const live = useLiveInput();
  return { ...(mock ? mockInput : live), mock };
}
