import { memo, useMemo } from 'react';
import type { MidiNote, PitchClass } from '@/core';
import { NOTE_NAMES_SHARP } from '@/core';
import { cx } from '../lib/cx';

export type PianoSize = 61 | 88;

export interface PianoProps {
  keys?: PianoSize;
  /** Detected pitch classes: lit dimly in every octave. */
  activePitchClasses?: readonly PitchClass[];
  /** Exact notes (MIDI): lit brightly. */
  activeMidiNotes?: readonly MidiNote[];
  /** Voicing display: left-hand notes (one colour) and right-hand notes (another). */
  leftHandNotes?: readonly MidiNote[];
  rightHandNotes?: readonly MidiNote[];
  /** Explicit key range [lowest, highest] (should start and end on white keys); overrides `keys`. */
  range?: readonly [MidiNote, MidiNote];
  /** Accessible name; defaults to "Piano, sounding …". */
  label?: string;
  className?: string;
}

const RANGE: Record<PianoSize, [number, number]> = { 88: [21, 108], 61: [36, 96] };
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const W = 24;
const H = 128;
const BW = 14;
const BH = 80;

export type KeyState = 'off' | 'pc' | 'exact' | 'left' | 'right';

interface KeyGeom {
  note: number;
  black: boolean;
  x: number;
}

function layout(lo: number, hi: number): { keys: KeyGeom[]; width: number } {
  const keys: KeyGeom[] = [];
  let white = 0;
  for (let n = lo; n <= hi; n++) {
    const black = IS_BLACK[n % 12];
    if (black) keys.push({ note: n, black, x: white * W - BW / 2 });
    else keys.push({ note: n, black, x: white++ * W });
  }
  return { keys, width: white * W };
}

const FILL: Record<KeyState, [white: string, black: string]> = {
  off: ['fill-zinc-200', 'fill-zinc-900'],
  pc: ['fill-violet-300/45', 'fill-violet-800'],
  exact: ['fill-violet-400', 'fill-violet-400'],
  left: ['fill-sky-400', 'fill-sky-500'],
  right: ['fill-violet-400', 'fill-violet-500'],
};

/** SVG keyboard. Pure props, no store coupling; scales to its container width. */
export const Piano = memo(function Piano({
  keys = 88,
  activePitchClasses = [],
  activeMidiNotes = [],
  leftHandNotes = [],
  rightHandNotes = [],
  range,
  label,
  className,
}: PianoProps) {
  const [lo, hi] = range ?? RANGE[keys];
  const geom = useMemo(() => layout(lo, hi), [lo, hi]);
  const pcs = new Set<number>(activePitchClasses);
  const exact = new Set<number>(activeMidiNotes);
  const left = new Set<number>(leftHandNotes);
  const right = new Set<number>(rightHandNotes);
  const stateOf = (n: number): KeyState =>
    left.has(n)
      ? 'left'
      : right.has(n)
        ? 'right'
        : exact.has(n)
          ? 'exact'
          : pcs.has(n % 12)
            ? 'pc'
            : 'off';

  const names = [
    ...new Set([
      ...[...activeMidiNotes, ...leftHandNotes, ...rightHandNotes].map((n) => n % 12),
      ...activePitchClasses,
    ]),
  ]
    .sort((a, b) => a - b)
    .map((pc) => NOTE_NAMES_SHARP[pc]);

  const renderKey = (k: KeyGeom) => {
    const st = stateOf(k.note);
    return (
      <rect
        key={k.note}
        data-note={k.note}
        data-state={st}
        x={k.x}
        y={0}
        width={k.black ? BW : W}
        height={k.black ? BH : H}
        rx={k.black ? 2 : 3}
        className={cx(FILL[st][k.black ? 1 : 0], 'stroke-zinc-950 transition-[fill] duration-75')}
        strokeWidth={k.black ? 1 : 1.5}
      />
    );
  };

  return (
    <svg
      viewBox={`0 0 ${geom.width} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        label ?? (names.length ? `Piano, sounding ${names.join(' ')}` : 'Piano, no notes')
      }
      className={cx('block h-auto w-full select-none', className)}
    >
      {geom.keys.filter((k) => !k.black).map(renderKey)}
      {geom.keys.filter((k) => k.black).map(renderKey)}
      {/* middle C orientation dot */}
      {geom.keys
        .filter((k) => k.note === 60)
        .map((k) => (
          <circle key="c4" cx={k.x + W / 2} cy={H - 12} r={3} className="fill-zinc-400" />
        ))}
    </svg>
  );
});
