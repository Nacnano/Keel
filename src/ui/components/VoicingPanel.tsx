import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import type { Chord, Key, MidiNote, PitchClass } from '@/core';
import {
  VOICING_STYLES,
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
import { Segmented, type SegmentedOption } from '../kit';
import { cx } from '../lib/cx';
import { Piano } from './Piano';

export interface VoicingPanelProps {
  /** Chord to voice; `null` shows the empty state. */
  chord: Chord | null;
  keyContext?: Key | null;
  spellingFollowsKey?: boolean;
  /** Called with the exact notes when a voicing row is tapped. */
  onPlay?(notes: MidiNote[]): void;
  /** @deprecated Accepted for compatibility; the panel always renders (its container owns visibility). */
  open?: boolean;
  /** @deprecated Accepted for compatibility; there is no header toggle. */
  onToggle?(): void;
  initialStyle?: VoicingStyle;
  /** Voicings per style (1–3). */
  max?: number;
  className?: string;
}

const option = (s: VoicingStyle): SegmentedOption<VoicingStyle> => ({
  value: s,
  label: voicingLabel(s),
  title: `${voicingLabel(s)}: ${voicingDescription(s)}`,
});

/**
 * Seven styles do not fit one segmented control in a 380 px inspector, so they sit in two
 * rows (pop / classical shapes, then jazz shapes) that act as one choice.
 */
const STYLE_ROWS: ReadonlyArray<{ label: string; options: SegmentedOption<VoicingStyle>[] }> = [
  { label: 'Pop and classical', options: VOICING_STYLES.slice(0, 3).map(option) },
  { label: 'Jazz', options: VOICING_STYLES.slice(3).map(option) },
];

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
  index,
  style,
  range,
  name,
  onPlay,
}: {
  notes: MidiNote[];
  index: number;
  style: VoicingStyle;
  range: [MidiNote, MidiNote];
  name: (n: MidiNote) => string;
  onPlay?(notes: MidiNote[]): void;
}) {
  const { left, right } = splitHands(notes);
  const lh = left.map(name).join(' ');
  const rh = right.map(name).join(' ');
  const spoken = [lh && `left hand ${lh}`, rh && `right hand ${rh}`].filter(Boolean).join(', ');
  return (
    <li>
      <button
        type="button"
        data-testid="voicing-card"
        aria-label={`Play ${voicingLabel(style)} voicing ${index + 1}: ${spoken}`}
        onClick={() => onPlay?.(notes)}
        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Piano
            range={range}
            leftHandNotes={left}
            rightHandNotes={right}
            ariaLabel={`${voicingLabel(style)} voicing ${index + 1}`}
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill-3 text-accent transition-colors duration-100 group-hover:bg-fill-2"
        >
          <Play className="size-3.5 fill-current" />
        </span>
      </button>
    </li>
  );
}

/** Piano voicings for the current chord by style; tap a row to hear it. */
export function VoicingPanel({
  chord,
  keyContext = null,
  spellingFollowsKey = true,
  onPlay,
  initialStyle = 'pop',
  max = 3,
  className,
}: VoicingPanelProps) {
  const [style, setStyle] = useState<VoicingStyle>(initialStyle);
  const shown = useMemo(
    () => (chord ? voicings(chord, { style }).slice(0, Math.max(1, Math.min(3, max))) : []),
    [chord, style, max],
  );
  const name = useMemo(
    () => (chord ? noteNamer(chord, keyContext, spellingFollowsKey) : null),
    [chord, keyContext, spellingFollowsKey],
  );
  const symbol = chord
    ? prettyAccidentals(chordSymbol(chord, keyContext, { spellingFollowsKey }))
    : null;

  return (
    <section aria-label="Voicings" className={cx('flex flex-col gap-3', className)}>
      <div role="radiogroup" aria-label="Voicing style" className="flex flex-col gap-1.5">
        {STYLE_ROWS.map((row) => {
          const here = row.options.some((o) => o.value === style);
          return (
            <Segmented<VoicingStyle>
              // remount when the choice moves to the other row so the pill hides here
              key={`${row.label}-${here}`}
              fill
              size="sm"
              aria-label={`${row.label} voicings`}
              options={row.options}
              value={style}
              onChange={setStyle}
            />
          );
        })}
      </div>
      {!chord || !name ? (
        <p className="text-subhead text-label-3">Voicings appear once a chord is detected.</p>
      ) : (
        <>
          <p className="text-footnote text-label-2">
            <span className="text-subhead font-semibold text-label">{symbol}</span>
            {' · '}
            {voicingDescription(style)}
          </p>
          {shown.length === 0 ? (
            <p className="text-subhead text-label-3">
              No {voicingLabel(style).toLowerCase()} voicing for {symbol}.
            </p>
          ) : (
            <ul className="flex flex-col overflow-hidden rounded-cell bg-fill-4 [&>li+li]:hairline-t">
              {shown.map((notes, i) => (
                <VoicingRow
                  key={notes.join(',')}
                  notes={notes}
                  index={i}
                  style={style}
                  range={rangeOf(shown)}
                  name={name}
                  onPlay={onPlay}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
