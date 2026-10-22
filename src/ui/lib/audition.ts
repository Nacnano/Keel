// Oscillator fallback for "tap to hear" (mock mode, or before the sampled piano loads);
// the live app routes through src/app/live/audition.ts, which prefers the @/midi player.
import type { Chord } from '@/core';
import { chordTones } from './chordLabel';

let ctx: AudioContext | null = null;

export function auditionChord(chord: Chord): void {
  const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
  if (!Ctor) return;
  ctx ??= new Ctor();
  void ctx.resume();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
  master.connect(ctx.destination);
  const notes = [36 + (chord.bass ?? chord.root), ...chordTones(chord).map((pc) => 60 + pc)];
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * 2 ** ((n - 69) / 12);
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 1.5);
  }
}
