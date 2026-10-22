import { useMemo, useState } from 'react';
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
import { cx } from '../lib/cx';
import { Piano } from './Piano';
import { Segmented } from './Segmented';

export interface VoicingPanelProps {
  /** Chord to voice; `null` shows the empty state. */
  chord: Chord | null;
  keyContext?: Key | null;
  spellingFollowsKey?: boolean;
  /** Called with the exact notes when a voicing card is tapped. */
  onPlay?(notes: MidiNote[]): void;
  /** Collapsible panel: when `onToggle` is given the header shows a Show / Hide button. */
  open?: boolean;
  onToggle?(): void;
  initialStyle?: VoicingStyle;
  /** Cards per style (1–3). */
  max?: number;
  className?: string;
}

const STYLE_OPTIONS = VOICING_STYLES.map((s) => ({
  value: s,
  label: voicingLabel(s),
  title: `${voicingLabel(s)}: ${voicingDescription(s)}`,
}));

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

function VoicingCard({
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
        className={cx(
          'flex w-full flex-col gap-2 rounded-xl bg-zinc-900 p-2.5 text-left ring-1 ring-zinc-800',
          'transition-colors duration-150 hover:bg-zinc-800 hover:ring-violet-400/40',
          'focus-visible:outline-2 focus-visible:outline-violet-300',
        )}
      >
        <Piano
          range={range}
          leftHandNotes={left}
          rightHandNotes={right}
          label={`${voicingLabel(style)} voicing ${index + 1}`}
          className="max-h-16"
        />
        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {lh && (
            <span className="text-sky-300">
              <span className="text-zinc-500">LH </span>
              {lh}
            </span>
          )}
          {rh && (
            <span className="text-violet-300">
              <span className="text-zinc-500">RH </span>
              {rh}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/** Piano voicings for the current chord by style; tap a card to hear it. */
export function VoicingPanel({
  chord,
  keyContext = null,
  spellingFollowsKey = true,
  onPlay,
  open = true,
  onToggle,
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
    <section aria-label="Voicings" className={cx('flex flex-col gap-2', className)}>
      <div className="flex min-h-9 items-center gap-2">
        <h2 className="text-xs font-medium tracking-widest text-zinc-500 uppercase">Voicings</h2>
        {open && symbol && <span className="text-sm font-semibold text-zinc-300">{symbol}</span>}
        {onToggle && (
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            title="Show or hide voicings (V)"
            className={cx(
              'ml-auto min-h-9 rounded-lg px-2.5 text-xs font-medium text-zinc-400',
              'hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-300',
            )}
          >
            {open ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {open && (
        <>
          <Segmented
            options={STYLE_OPTIONS}
            value={style}
            onChange={setStyle}
            aria-label="Voicing style"
            size="sm"
            className="flex-wrap self-start"
          />
          {!chord || !name ? (
            <p className="flex min-h-12 items-center text-sm text-zinc-600">
              Voicings appear once a chord is detected.
            </p>
          ) : shown.length === 0 ? (
            <p className="flex min-h-12 items-center text-sm text-zinc-600">
              No {voicingLabel(style).toLowerCase()} voicing for {symbol}.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {shown.map((notes, i) => (
                <VoicingCard
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
