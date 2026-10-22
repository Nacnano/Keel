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
  /** Explicit [lowest, highest] MIDI range; overrides `keys` (e.g. a two-octave helper). */
  range?: readonly [MidiNote, MidiNote];
  /** Scale tones: tinted softly in every octave (below detected notes in priority). */
  highlightPitchClasses?: readonly PitchClass[];
  /** Tones to stress within the highlight (chord tones): brighter than plain highlights. */
  accentPitchClasses?: readonly PitchClass[];
  /** Marks this pitch class (scale root) with a dot on every octave. */
  rootPitchClass?: PitchClass | null;
  /** Small note names drawn on keys, by pitch class (e.g. spelled scale notes). */
  labels?: Partial<Record<PitchClass, string>>;
  /** Overrides the generated accessible name. */
  ariaLabel?: string;
  className?: string;
}

const RANGE: Record<PianoSize, [number, number]> = { 88: [21, 108], 61: [36, 96] };
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const W = 24;
const H = 128;
const BW = 14;
const BH = 80;

export type KeyState = 'off' | 'scale' | 'chord' | 'pc' | 'exact';

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
  scale: ['fill-violet-200/55', 'fill-violet-700'],
  chord: ['fill-violet-300', 'fill-violet-400'],
  pc: ['fill-violet-300/45', 'fill-violet-800'],
  exact: ['fill-violet-400', 'fill-violet-400'],
};

/** SVG keyboard. Pure props, no store coupling; scales to its container width. */
export const Piano = memo(function Piano({
  keys = 88,
  activePitchClasses = [],
  activeMidiNotes = [],
  range,
  highlightPitchClasses = [],
  accentPitchClasses = [],
  rootPitchClass = null,
  labels,
  ariaLabel,
  className,
}: PianoProps) {
  const [lo, hi] = range ?? RANGE[keys];
  const geom = useMemo(() => layout(lo, hi), [lo, hi]);
  const pcs = new Set<number>(activePitchClasses);
  const exact = new Set<number>(activeMidiNotes);
  const scale = new Set<number>(highlightPitchClasses);
  const accent = new Set<number>(accentPitchClasses);
  const stateOf = (n: number): KeyState =>
    exact.has(n)
      ? 'exact'
      : pcs.has(n % 12)
        ? 'pc'
        : accent.has(n % 12)
          ? 'chord'
          : scale.has(n % 12)
            ? 'scale'
            : 'off';

  const names = [...new Set([...activeMidiNotes.map((n) => n % 12), ...activePitchClasses])]
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
        ariaLabel ?? (names.length ? `Piano, sounding ${names.join(' ')}` : 'Piano, no notes')
      }
      className={cx('block h-auto w-full select-none', className)}
    >
      {geom.keys.filter((k) => !k.black).map(renderKey)}
      {geom.keys.filter((k) => k.black).map(renderKey)}
      {labels &&
        geom.keys
          .filter((k) => labels[(k.note % 12) as PitchClass])
          .map((k) => (
            <text
              key={`l${k.note}`}
              x={k.x + (k.black ? BW : W) / 2}
              y={k.black ? BH - 8 : H - 24}
              textAnchor="middle"
              aria-hidden
              className={cx(
                'pointer-events-none font-semibold',
                k.black ? 'fill-white text-[7px]' : 'fill-zinc-900 text-[9px]',
              )}
            >
              {labels[(k.note % 12) as PitchClass]}
            </text>
          ))}
      {/* scale root dots */}
      {rootPitchClass !== null &&
        geom.keys
          .filter((k) => k.note % 12 === rootPitchClass)
          .map((k) => (
            <circle
              key={`r${k.note}`}
              data-root={k.note}
              cx={k.x + (k.black ? BW : W) / 2}
              cy={k.black ? BH - 22 : H - 12}
              r={3.5}
              className={k.black ? 'fill-white' : 'fill-zinc-900'}
            />
          ))}
      {/* middle C orientation dot */}
      {geom.keys
        .filter((k) => k.note === 60 && rootPitchClass !== 0)
        .map((k) => (
          <circle key="c4" cx={k.x + W / 2} cy={H - 12} r={3} className="fill-zinc-400" />
        ))}
    </svg>
  );
});
