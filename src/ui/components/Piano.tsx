import { memo, useMemo } from 'react';
import type { MidiNote, PitchClass } from '@/core';
import { NOTE_NAMES_SHARP } from '@/core';
import { cx } from '../lib/cx';

export type PianoSize = 61 | 88;

export interface PianoProps {
  keys?: PianoSize;
  /** Detected pitch classes: lit dimly in every octave. */
  activePitchClasses?: readonly PitchClass[];
  /** Confirmed observed notes, in their detected octaves. */
  activeMidiNotes?: readonly MidiNote[];
  /** Provisional observed notes: outlined, never repeated across octaves. */
  tentativeMidiNotes?: readonly MidiNote[];
  /** 0..1 display evidence for observed notes, not calibrated probabilities. */
  noteConfidences?: Readonly<Record<number, number>>;
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
  /** Voicing display: left-hand notes (one colour) and right-hand notes (another). */
  leftHandNotes?: readonly MidiNote[];
  rightHandNotes?: readonly MidiNote[];
  className?: string;
}

const RANGE: Record<PianoSize, [number, number]> = { 88: [21, 108], 61: [36, 96] };
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const W = 24;
const H = 128;
const BW = 14;
const BH = 80;

export type KeyState = 'off' | 'scale' | 'chord' | 'pc' | 'exact' | 'tentative' | 'left' | 'right';

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
  off: ['fill-[#f4f4f5]', 'fill-[#111113]'],
  scale: ['fill-accent/22', 'fill-accent/45'],
  chord: ['fill-accent/80', 'fill-accent'],
  pc: ['fill-accent/22', 'fill-accent/45'],
  exact: ['fill-accent', 'fill-accent'],
  tentative: ['fill-[#f4f4f5]', 'fill-[#111113]'],
  left: ['fill-sky-400', 'fill-sky-500'],
  right: ['fill-accent', 'fill-accent'],
};

/** SVG keyboard. Pure props, no store coupling; scales to its container width. */
export const Piano = memo(function Piano({
  keys = 88,
  activePitchClasses = [],
  activeMidiNotes = [],
  tentativeMidiNotes = [],
  noteConfidences,
  range,
  highlightPitchClasses = [],
  accentPitchClasses = [],
  rootPitchClass = null,
  labels,
  ariaLabel,
  leftHandNotes = [],
  rightHandNotes = [],
  className,
}: PianoProps) {
  const [lo, hi] = range ?? RANGE[keys];
  const geom = useMemo(() => layout(lo, hi), [lo, hi]);
  const pcs = new Set<number>(activePitchClasses);
  const exact = new Set<number>(activeMidiNotes);
  const tentative = new Set<number>(tentativeMidiNotes.filter((note) => !exact.has(note)));
  const scale = new Set<number>(highlightPitchClasses);
  const accent = new Set<number>(accentPitchClasses);
  const left = new Set<number>(leftHandNotes);
  const right = new Set<number>(rightHandNotes);
  const stateOf = (n: number): KeyState =>
    left.has(n)
      ? 'left'
      : right.has(n)
        ? 'right'
        : exact.has(n)
          ? 'exact'
          : tentative.has(n)
            ? 'tentative'
            : pcs.has(n % 12)
              ? 'pc'
              : accent.has(n % 12)
                ? 'chord'
                : scale.has(n % 12)
                  ? 'scale'
                  : 'off';

  const names = [
    ...new Set([
      ...[...activeMidiNotes, ...leftHandNotes, ...rightHandNotes].map((n) => n % 12),
      ...activePitchClasses,
    ]),
  ]
    .sort((a, b) => a - b)
    .map((pc) => NOTE_NAMES_SHARP[pc]);

  const noteName = (n: number) => `${NOTE_NAMES_SHARP[n % 12]}${Math.floor(n / 12) - 1}`;
  const observedNames = [...exact].sort((a, b) => a - b).map(noteName);
  const tentativeNames = [...tentative]
    .filter((n) => !exact.has(n))
    .sort((a, b) => a - b)
    .map(noteName);
  const accessibleNotes = [
    observedNames.length ? `confirmed ${observedNames.join(', ')}` : '',
    tentativeNames.length ? `tentative ${tentativeNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ');

  const renderKey = (k: KeyGeom) => {
    const st = stateOf(k.note);
    const observed = st === 'exact' || st === 'tentative';
    const fallbackConfidence = st === 'tentative' ? 0.35 : 1;
    const score = noteConfidences?.[k.note];
    const confidence =
      typeof score === 'number' && Number.isFinite(score)
        ? Math.min(1, Math.max(0, score))
        : fallbackConfidence;
    // Spread middle support values across a visible tint range. Keep a minimum
    // tint for every detected key; opacity is not a probability percentage.
    const opacity = Number.isFinite(score)
      ? Math.round((0.2 + 0.8 * confidence ** 2) * 100) / 100
      : fallbackConfidence;
    const geometry = {
      x: k.x,
      y: 0,
      width: k.black ? BW : W,
      height: k.black ? BH : H,
      rx: k.black ? 2 : 3,
    };
    return (
      <g key={k.note}>
        <rect
          {...geometry}
          data-note={k.note}
          data-state={st}
          className={cx(
            FILL[observed ? 'off' : st][k.black ? 1 : 0],
            'stroke-black/70 transition-[fill] duration-75',
          )}
          strokeWidth={k.black ? 1 : 1.5}
          vectorEffect="non-scaling-stroke"
        />
        {observed && (
          <rect
            {...geometry}
            data-note-accent={k.note}
            aria-hidden="true"
            className={cx(
              'fill-accent transition-[fill-opacity] duration-75',
              st === 'tentative' ? 'stroke-accent' : 'stroke-black/70',
            )}
            fillOpacity={opacity}
            strokeWidth={st === 'tentative' ? 3 : k.black ? 1 : 1.5}
            strokeDasharray={st === 'tentative' ? '4 3' : undefined}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${geom.width} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={
        ariaLabel ??
        (accessibleNotes
          ? `Piano, ${accessibleNotes}`
          : names.length
            ? `Piano, sounding ${names.join(' ')}`
            : 'Piano, no notes')
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
                k.black ? 'fill-white text-[7px]' : 'fill-black/80 text-[9px]',
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
              className={k.black ? 'fill-white' : 'fill-black/80'}
            />
          ))}
      {/* middle C orientation dot */}
      {geom.keys
        .filter((k) => k.note === 60 && rootPitchClass !== 0)
        .map((k) => (
          <circle key="c4" cx={k.x + W / 2} cy={H - 12} r={3} className="fill-black/30" />
        ))}
    </svg>
  );
});
