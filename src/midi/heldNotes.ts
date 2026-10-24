/**
 * Pure held-note model. A note is "held" while its key is down OR the sustain
 * pedal (CC64) is down; it is released once both are up. Channels are merged:
 * a keyboard plays one instrument as far as chord detection is concerned.
 */
import type { ChromaFrame, MidiEvent, MidiNote, PitchClass, Seconds } from '@/core/types';
import { CC_ALL_NOTES_OFF, CC_ALL_SOUND_OFF, CC_SUSTAIN, isSustainDown } from './parse';

export interface HeldNotes {
  /** Apply one event. Returns true when the held set (or a velocity) changed. */
  apply(event: MidiEvent): boolean;
  /** Currently sounding notes (key down or sustained) -> last note-on velocity. */
  held(): Map<MidiNote, number>;
  /** Notes whose key is physically down. */
  keysDown(): Set<MidiNote>;
  isSustainDown(): boolean;
  /**
   * Exact ChromaFrame of the held notes. `onset` is true on the first frame
   * built after a note-on; building the frame consumes the onset flag.
   */
  toFrame(t: Seconds): ChromaFrame;
  /** Drop everything (device unplugged, disconnect). Returns true if anything was held. */
  reset(): boolean;
}

export function createHeldNotes(): HeldNotes {
  const sounding = new Map<MidiNote, number>();
  const down = new Set<MidiNote>();
  let sustain = false;
  let pendingOnset = false;

  const releaseUnheld = (): boolean => {
    let changed = false;
    for (const note of Array.from(sounding.keys())) {
      if (!down.has(note)) {
        sounding.delete(note);
        changed = true;
      }
    }
    return changed;
  };

  return {
    apply(e) {
      if (e.type !== 'cc') {
        if (e.type === 'on') {
          down.add(e.note);
          sounding.set(e.note, e.velocity);
          pendingOnset = true;
          return true;
        }
        down.delete(e.note);
        if (sustain || !sounding.has(e.note)) return false;
        sounding.delete(e.note);
        return true;
      }
      if (e.controller === CC_SUSTAIN) {
        const next = isSustainDown(e.value);
        if (next === sustain) return false;
        sustain = next;
        return sustain ? false : releaseUnheld();
      }
      if (e.controller === CC_ALL_NOTES_OFF || e.controller === CC_ALL_SOUND_OFF) {
        down.clear();
        if (e.controller === CC_ALL_SOUND_OFF) sustain = false;
        return sustain ? false : releaseUnheld();
      }
      return false;
    },
    held() {
      return new Map(sounding);
    },
    keysDown() {
      return new Set(down);
    },
    isSustainDown() {
      return sustain;
    },
    toFrame(t) {
      const chroma = new Float32Array(12);
      let lowest = Infinity;
      for (const [note, velocity] of sounding) {
        chroma[note % 12] += velocity / 127;
        if (note < lowest) lowest = note;
      }
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += chroma[i];
      if (sum > 0) for (let i = 0; i < 12; i++) chroma[i] /= sum;
      const onset = pendingOnset;
      pendingOnset = false;
      return {
        t,
        chroma,
        energy: sounding.size > 0 ? 1 : 0,
        bass: sounding.size > 0 ? ((lowest % 12) as PitchClass) : null,
        onset,
        exact: true,
        midiNotes: [...sounding.keys()].sort((a, b) => a - b),
      };
    },
    reset() {
      const had = sounding.size > 0;
      sounding.clear();
      down.clear();
      sustain = false;
      pendingOnset = false;
      return had;
    },
  };
}
