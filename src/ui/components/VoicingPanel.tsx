import { useMemo } from 'react';
import { Play } from 'lucide-react';
import type { Chord, Key, MidiNote, PitchClass, VocabLevel } from '@/core';
import {
  chordSymbol,
  chordTones,
  prettyAccidentals,
  spell,
  spellBass,
  spellChord,
  splitHands,
  voicingDescription,
  voicingLabel,
  voicings,
} from '@/theory';
import type { VoicingStyle } from '@/theory';
import { cx } from '../lib/cx';
import { Piano } from './Piano';

export interface VoicingPanelProps {
  /** Chord to voice; `null` shows the empty state. */
  chord: Chord | null;
  keyContext?: Key | null;
  spellingFollowsKey?: boolean;
  /** Chord detail level: from "With 7ths" up the rows are jazz shapes. */
  level?: VocabLevel;
  /** Called with the exact notes when a voicing row is tapped. */
  onPlay?(notes: MidiNote[]): void;
  className?: string;
}

/** Three shapes per level, one row each: jazz shapes once 7ths are on, simple shapes below. */
const JAZZ_STYLES: readonly VoicingStyle[] = ['shell', 'rootlessA', 'rootlessB'];
const SIMPLE_STYLES: readonly VoicingStyle[] = ['close', 'spread', 'pop'];

function voicingStylesFor(level: VocabLevel): readonly VoicingStyle[] {
  return level >= 2 ? JAZZ_STYLES : SIMPLE_STYLES;
}

/** Note name with octave, spelled as a chord tone where possible ("E#4" in C#7). */
function noteNamer(chord: Chord, key: Key | null, spellingFollowsKey: boolean) {
  const opts = { spellingFollowsKey };
  const tones = chordTones(chord);
  const spelled = spellChord(chord, key, opts);
  const bass = spellBass(chord, key, opts);
  const nameOf = (p: PitchClass) => {
    if (bass && p === chord.bass) return bass;
    const k = tones.indexOf(p);
    return k >= 0 ? spelled[k] : spell(p, key, opts);
  };
  return (n: MidiNote) => {
    const name = nameOf((n % 12) as PitchClass);
    // the octave follows the letter: B#3 sounds as C4
    const acc = (name.match(/#/g)?.length ?? 0) - (name.slice(1).match(/b/g)?.length ?? 0);
    return prettyAccidentals(`${name}${Math.floor((n - acc) / 12) - 1}`);
  };
}

/** Keyboard range covering every voicing, from a C to a B. */
function rangeOf(vs: readonly MidiNote[][]): [MidiNote, MidiNote] {
  const all = vs.flat();
  const lo = Math.floor(Math.min(...all) / 12) * 12;
  const hi = Math.floor(Math.max(...all) / 12) * 12 + 11;
  return [lo, Math.max(hi, lo + 23)];
}

function VoicingRow({
  notes,
  style,
  range,
  name,
  onPlay,
}: {
  notes: MidiNote[];
  style: VoicingStyle;
  range: [MidiNote, MidiNote];
  name: (n: MidiNote) => string;
  onPlay?(notes: MidiNote[]): void;
}) {
  const { left, right } = splitHands(notes);
  const lh = left.map(name).join(' ');
  const rh = right.map(name).join(' ');
  const spoken = [lh && `left hand ${lh}`, rh && `right hand ${rh}`].filter(Boolean).join(', ');
  const label = voicingLabel(style);
  return (
    <li>
      <button
        type="button"
        data-testid="voicing-card"
        aria-label={`Play ${label} voicing: ${spoken}`}
        title={voicingDescription(style)}
        onClick={() => onPlay?.(notes)}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-subhead font-semibold text-label">{label}</span>
          <Piano
            range={range}
            leftHandNotes={left}
            rightHandNotes={right}
            ariaLabel={`${label} voicing`}
            className="w-full max-w-sm"
          />
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-footnote text-label-2 tabular">
            {lh && (
              <span>
                <span className="text-label-3">LH </span>
                {lh}
              </span>
            )}
            {rh && (
              <span>
                <span className="text-label-3">RH </span>
                {rh}
              </span>
            )}
          </span>
        </span>
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-fill-3 text-accent transition-colors duration-100 group-hover:bg-fill-2"
        >
          <Play className="size-4 fill-current" />
        </span>
      </button>
    </li>
  );
}

/** Three ways to voice the current chord, one row each; tap a row to hear it. */
export function VoicingPanel({
  chord,
  keyContext = null,
  spellingFollowsKey = true,
  level = 2,
  onPlay,
  className,
}: VoicingPanelProps) {
  const rows = useMemo(() => {
    if (!chord) return [];
    const pick = (styles: readonly VoicingStyle[]) =>
      styles.flatMap((style) => {
        const [notes] = voicings(chord, { style });
        return notes ? [{ style, notes }] : [];
      });
    const jazz = pick(voicingStylesFor(level));
    // A chord with no jazz shape (a power chord) still gets the simple ones.
    return jazz.length ? jazz : pick(SIMPLE_STYLES);
  }, [chord, level]);
  const name = useMemo(
    () => (chord ? noteNamer(chord, keyContext, spellingFollowsKey) : null),
    [chord, keyContext, spellingFollowsKey],
  );
  const range = useMemo(() => (rows.length ? rangeOf(rows.map((r) => r.notes)) : null), [rows]);
  const symbol = chord
    ? prettyAccidentals(chordSymbol(chord, keyContext, { spellingFollowsKey }))
    : null;

  return (
    <section aria-label="Voicings" className={cx('flex flex-col gap-3', className)}>
      {!chord || !name || !range ? (
        <p className="text-subhead text-label-3">Voicings appear once a chord holds.</p>
      ) : (
        <>
          <p className="text-subhead font-semibold text-label">{symbol}</p>
          <ul className="flex flex-col overflow-hidden rounded-cell bg-fill-4 [&>li+li]:hairline-t">
            {rows.map((r) => (
              <VoicingRow
                key={r.style}
                notes={r.notes}
                style={r.style}
                range={range}
                name={name}
                onPlay={onPlay}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
