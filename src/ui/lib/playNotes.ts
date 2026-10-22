/**
 * "Tap to hear" for exact notes (voicing cards). Plays through the sampled piano once it is
 * loaded; before that (first tap, samples downloading) a short oscillator preview sounds so
 * the tap is never silent.
 */
import type { MidiNote } from '@/core';
import { playVoicing } from '@/midi';
import { ensurePianoLoaded, getPianoPlayer } from '@/app/live/audition';

const DURATION_MS = 1400;

let release: (() => void) | null = null;
let ctx: AudioContext | null = null;

function oscillatorPreview(notes: readonly MidiNote[]): void {
  const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
  if (!Ctor) return;
  ctx ??= new Ctor();
  void ctx.resume();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  master.connect(ctx.destination);
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * 2 ** ((n - 69) / 12);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 1.5);
  }
}

/** Sound `notes` together, releasing whatever the previous tap left ringing. */
export function playNotes(notes: readonly MidiNote[]): void {
  release?.();
  release = null;
  const player = getPianoPlayer();
  if (player.isLoaded()) {
    release = playVoicing(player, notes, DURATION_MS);
    return;
  }
  oscillatorPreview(notes);
  void ensurePianoLoaded();
}
