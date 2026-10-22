import { memo, useMemo, useState } from 'react';
import { MIN_DISPLAY_CONFIDENCE } from '@/core';
import type { Chord, ChordQuality, Key, PitchClass } from '@/core';
import {
  chordSymbol,
  chordTones,
  prettyAccidentals,
  sameChord,
  scaleNotesSpelled,
  scalesForChord,
  spell,
} from '@/theory';
import type { ScaleId, ScaleSuggestion } from '@/theory';
import { cx } from '../lib/cx';
import { Piano } from './Piano';

/** Chips shown before "more…". */
export const SCALE_CHIPS_COLLAPSED = 4;

/** Two octaves, C3 to C5: enough to see the shape without crowding the jam screen. */
const HELPER_RANGE = [48, 72] as const;

export interface ScaleHelperProps {
  /** The chord being played now (jamStore.currentChord). */
  chord: Chord | null;
  /** Detection confidence; below MIN_DISPLAY_CONFIDENCE the last confident chord is kept. */
  confidence?: number;
  keyContext: Key | null;
  spellingFollowsKey?: boolean;
  /** Collapsed panels show only a "Scales" button. Default true. */
  open?: boolean;
  onToggle?(): void;
  className?: string;
}

/**
 * Keeps the last confident chord so the panel does not flicker on low-confidence frames;
 * clears when the chord goes away (stop / reset).
 */
function useHeldChord(chord: Chord | null, confidence: number): Chord | null {
  const [held, setHeld] = useState<Chord | null>(null);
  const confident = chord && confidence >= MIN_DISPLAY_CONFIDENCE ? chord : null;
  if (!chord && held) setHeld(null);
  else if (confident && !sameChord(confident, held)) setHeld(confident);
  return confident ?? (chord ? held : null);
}

function Chip({
  s,
  label,
  active,
  onPick,
}: {
  s: ScaleSuggestion;
  label: string;
  active: boolean;
  onPick(id: ScaleId): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={prettyAccidentals(s.reason)}
      data-rank={s.rank}
      onClick={() => onPick(s.id)}
      className={cx(
        'min-h-11 rounded-xl px-3 text-sm font-medium ring-1 transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-violet-300',
        active
          ? 'bg-violet-400/15 text-violet-100 ring-violet-400/50'
          : 'bg-zinc-900 text-zinc-300 ring-zinc-800 hover:bg-zinc-800 hover:text-zinc-100',
      )}
    >
      {label}
    </button>
  );
}

/**
 * Live scale helper (DESIGN.md §3.4): ranked scales for the current chord in the current key,
 * the chosen scale spelled for the key, and a small keyboard with scale tones lit and chord
 * tones brighter. The choice is remembered per chord quality.
 */
export const ScaleHelper = memo(function ScaleHelper({
  chord,
  confidence = 1,
  keyContext,
  spellingFollowsKey = true,
  open = true,
  onToggle,
  className,
}: ScaleHelperProps) {
  const shown = useHeldChord(chord, confidence);
  const [picked, setPicked] = useState<Partial<Record<ChordQuality, ScaleId>>>({});
  const [expanded, setExpanded] = useState(false);
  const opts = { spellingFollowsKey };

  const root = shown?.root;
  const quality = shown?.quality;
  const tonic = keyContext?.tonic;
  const mode = keyContext?.mode;
  const ranked = useMemo(() => {
    if (root === undefined || quality === undefined) return [];
    const key = tonic === undefined || mode === undefined ? null : { tonic, mode };
    return scalesForChord({ root, quality }, key);
  }, [root, quality, tonic, mode]);

  const header = (
    <div className="flex min-h-11 items-center gap-3">
      <h2 className="text-xs font-medium tracking-widest text-zinc-500 uppercase">Scales</h2>
      {open && shown && (
        <span className="text-sm text-zinc-400">
          over{' '}
          <span className="font-semibold text-zinc-200">
            {prettyAccidentals(chordSymbol(shown, keyContext, { ...opts, showSlash: false }))}
          </span>
        </span>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? 'Hide scale helper (S)' : 'Show scale helper (S)'}
          className={cx(
            'ml-auto min-h-11 rounded-xl px-3 text-xs font-medium text-zinc-400',
            'hover:bg-zinc-800/70 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-violet-300',
          )}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      )}
    </div>
  );

  if (!open) {
    return (
      <section aria-label="Scale helper" className={cx('flex flex-col', className)}>
        {header}
      </section>
    );
  }

  if (!shown || ranked.length === 0) {
    return (
      <section aria-label="Scale helper" className={cx('flex flex-col gap-2', className)}>
        {header}
        <p className="flex min-h-12 items-center text-sm text-zinc-600">
          Play a chord to see scales that fit.
        </p>
      </section>
    );
  }

  const remembered = quality ? picked[quality] : undefined;
  const selected = ranked.find((s) => s.id === remembered) ?? ranked[0];
  const visible = expanded
    ? ranked
    : ranked.filter((s) => s.rank <= SCALE_CHIPS_COLLAPSED || s.id === selected.id);
  const hiddenCount = ranked.length - visible.length;
  const labelOf = (s: ScaleSuggestion) =>
    prettyAccidentals(`${spell(s.root, keyContext, opts)} ${s.name}`);

  const notes = scaleNotesSpelled(selected, keyContext, opts).map(prettyAccidentals);
  const chordSet = new Set<number>(chordTones(shown));
  const accent = selected.pitchClasses.filter((p) => chordSet.has(p));
  const labels: Partial<Record<PitchClass, string>> = {};
  selected.pitchClasses.forEach((p, i) => {
    labels[p] = notes[i];
  });

  const pick = (id: ScaleId) => {
    if (quality) setPicked((m) => ({ ...m, [quality]: id }));
  };

  return (
    <section aria-label="Scale helper" className={cx('flex flex-col gap-2', className)}>
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Scales that fit" className="flex flex-wrap gap-2">
          {visible.map((s) => (
            <Chip key={s.id} s={s} label={labelOf(s)} active={s.id === selected.id} onPick={pick} />
          ))}
        </div>
        {(hiddenCount > 0 || expanded) && ranked.length > SCALE_CHIPS_COLLAPSED && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="min-h-11 rounded-xl px-3 text-sm text-zinc-500 hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-violet-300"
          >
            {expanded ? 'less' : `more… (${hiddenCount})`}
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-500">{prettyAccidentals(selected.reason)}</p>
      <ol
        aria-label={`${labelOf(selected)} notes`}
        data-testid="scale-notes"
        className="flex gap-1"
      >
        {notes.map((n, i) => {
          const p = selected.pitchClasses[i];
          return (
            <li
              key={p}
              data-chord-tone={chordSet.has(p) || undefined}
              className={cx(
                'min-w-8 rounded-md px-1.5 py-0.5 text-center text-sm tabular-nums',
                chordSet.has(p)
                  ? 'bg-violet-400/15 font-semibold text-violet-100'
                  : 'text-zinc-300',
                i === 0 && 'ring-1 ring-violet-400/40',
              )}
            >
              {n}
            </li>
          );
        })}
      </ol>
      <Piano
        range={HELPER_RANGE}
        highlightPitchClasses={selected.pitchClasses}
        accentPitchClasses={accent}
        rootPitchClass={selected.root}
        labels={labels}
        ariaLabel={`Scale keys: ${labelOf(selected)}, ${notes.join(' ')}`}
        className="max-h-28"
      />
    </section>
  );
});
