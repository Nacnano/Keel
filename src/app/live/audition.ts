/**
 * "Tap to hear" a chord. Uses the sampled piano once it is loaded; before
 * that (first tap, samples downloading) falls back to a simple oscillator
 * preview so the tap always makes a sound.
 */
import type { Chord } from '@/core';
import { createMidiPlayer, playChord } from '@/midi';
import type { PianoPlayer } from '@/midi';
import { auditionChord as oscillatorPreview } from '@/ui/lib/audition';
import { toast } from '@/ui/components/toastStore';
import { liveInput } from './liveInput';

let player: PianoPlayer | null = null;
let loading: Promise<void> | null = null;
let release: (() => void) | null = null;

export function getPianoPlayer(): PianoPlayer {
  player ??= createMidiPlayer(liveInput().getAudioContext() ?? undefined);
  return player;
}

export function ensurePianoLoaded(): Promise<void> {
  const p = getPianoPlayer();
  if (p.isLoaded()) return Promise.resolve();
  loading ??= p
    .load()
    .catch((err) => {
      console.warn('[audition] piano samples failed to load', err);
      toast('Piano sound unavailable; using a simple tone.', { tone: 'info' });
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function auditionChord(chord: Chord): void {
  const p = getPianoPlayer();
  if (p.isLoaded()) {
    release?.();
    release = playChord(p, chord, { durationMs: 1000 });
    return;
  }
  oscillatorPreview(chord);
  void ensurePianoLoaded();
}
