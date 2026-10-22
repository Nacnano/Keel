import { useCallback, useEffect, useRef } from 'react';
import { clock } from '@/core';
import type { AnalysisEvent, MidiNote, PitchClass } from '@/core';
import { createMockAnalysisStream, JAZZ_PROGRESSION, POP_PROGRESSION } from '@/core/mocks';
import type { MockStream } from '@/core/mocks';
import { jamStore } from '@/state/jamStore';
import { settingsStore } from '@/state/settingsStore';

export interface JamInput {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
}

/** True when the URL has `?mock=1` (dev / demo mode, no audio needed). */
export function isMockMode(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('mock') === '1';
}

/** Close voicing so the piano shows bright exact notes in mock mode: bass in octave 3, rest in 4. */
function voice(pcs: readonly PitchClass[]): MidiNote[] {
  if (pcs.length === 0) return [];
  return [48 + pcs[0], ...pcs.map((pc) => 60 + pc)];
}

/**
 * Feeds `createMockAnalysisStream()` into `jamStore.applyEvent`. The integrator adds the real
 * input hook next to this one; `useJamInput` picks between them.
 */
export function useMockInput(): JamInput {
  const active = useRef<{ stream: MockStream; off: () => void } | null>(null);

  const stop = useCallback(() => {
    const cur = active.current;
    if (!cur) return;
    cur.stream.stop();
    cur.off();
    active.current = null;
    jamStore.getState().stopSession();
  }, []);

  const start = useCallback(() => {
    if (active.current) return;
    const level = settingsStore.getState().vocabLevel;
    const chords =
      level === 1
        ? POP_PROGRESSION
        : [...POP_PROGRESSION, ...POP_PROGRESSION, ...POP_PROGRESSION, ...JAZZ_PROGRESSION];
    const stream = createMockAnalysisStream({ chords, stepMs: 1500 });
    const jam = jamStore.getState();
    jam.startSession(clock.now());
    jam.setSource('mic');
    const off = stream.subscribe((e: AnalysisEvent) => {
      const ev =
        e.type === 'notes' && !e.midiNotes ? { ...e, midiNotes: voice(e.pitchClasses) } : e;
      jamStore.getState().applyEvent(ev);
    });
    active.current = { stream, off };
    stream.start();
  }, []);

  useEffect(() => stop, [stop]);

  return { start, stop };
}
