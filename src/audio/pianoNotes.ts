/**
 * Which piano keys are actually sounding.
 *
 * Chroma is 12 pitch classes. Painting every octave of a class lights keys that
 * were not played, and a single noise tone lights a whole column. A key lights
 * only when a peak in piano range still owns its energy after harmonic
 * attribution and has the partials a piano note carries. Partials that a lower
 * note already explained stay dark, so one tone does not become a fifth, a
 * third and seven extra octaves.
 */
import type { MidiNote } from '@/core/types';
import { attributeHarmonics, hzToMidi } from './chroma';
import type { Peak } from './peaks';

const STRETCH_LO = 2 ** (-35 / 1200);
const STRETCH_HI = 2 ** (65 / 1200);
/** Share of the strongest note's mass a quieter chord tone must still have. */
const MIN_MASS = 0.16;
const MAX_CENTS = 40;
const PIANO_LO = 21;
const PIANO_HI = 108;
const PARTIAL_CEILING_HZ = 5000;

function nearestPartial(peaks: readonly Peak[], freq: number): number {
  const lo = freq * STRETCH_LO;
  const hi = freq * STRETCH_HI;
  let a = 0;
  let b = peaks.length;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (peaks[mid].freq < lo) a = mid + 1;
    else b = mid;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = a; i < peaks.length && peaks[i].freq <= hi; i++) {
    const d = Math.abs(Math.log(peaks[i].freq / freq));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** How many partials a fundamental must show before it can be a played key. */
function requiredPartials(freq: number): number {
  if (freq * 2 <= PARTIAL_CEILING_HZ) return 1;
  return 0;
}

function partialCount(peaks: readonly Peak[], index: number, harmonics: number): number {
  const f0 = peaks[index].freq;
  const floor = peaks[index].mag * 0.08;
  let count = 0;
  const maxH = Math.min(harmonics, 8);
  for (let h = 2; h <= maxH; h++) {
    const target = f0 * h;
    if (target > PARTIAL_CEILING_HZ) break;
    const j = nearestPartial(peaks, target);
    if (j > index && peaks[j].mag >= floor) count++;
  }
  return count;
}

/**
 * MIDI note numbers to light. `peaks` must be sorted by ascending frequency.
 * Empty when the frame has no supported piano tone.
 */
export function estimatePlayedMidiNotes(
  peaks: readonly Peak[],
  a4 = 440,
  harmonics = 8,
  magnitudeExponent = 0.6,
): MidiNote[] {
  if (peaks.length === 0) return [];
  const { own, claimed } = attributeHarmonics(peaks, harmonics, magnitudeExponent);
  const mass = new Float64Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) mass[i] = own[i] + claimed[i];
  const supported = new Uint8Array(peaks.length);
  let best = 0;
  for (let i = 0; i < peaks.length; i++) {
    const need = requiredPartials(peaks[i].freq);
    if (need > 0 && partialCount(peaks, i, harmonics) < need) continue;
    supported[i] = 1;
    if (mass[i] > best) best = mass[i];
  }
  if (!(best > 0)) return [];
  const byMidi = new Map<number, number>();
  for (let i = 0; i < peaks.length; i++) {
    if (!supported[i] || mass[i] < best * MIN_MASS) continue;
    if (requiredPartials(peaks[i].freq) === 0 && mass[i] < best * 0.45) continue;
    const midiF = hzToMidi(peaks[i].freq, a4);
    const midi = Math.round(midiF);
    if (midi < PIANO_LO || midi > PIANO_HI) continue;
    if (Math.abs(midiF - midi) * 100 > MAX_CENTS) continue;
    byMidi.set(midi, (byMidi.get(midi) ?? 0) + mass[i]);
  }
  let top = 0;
  for (const value of byMidi.values()) if (value > top) top = value;
  if (!(top > 0)) return [];
  const notes: number[] = [];
  for (const [midi, value] of byMidi) if (value >= top * MIN_MASS) notes.push(midi);
  notes.sort((a, b) => a - b);
  return notes;
}
