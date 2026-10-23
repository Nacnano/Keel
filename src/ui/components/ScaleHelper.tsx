import { memo, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
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
import { Badge } from '../kit';
import { cx } from '../lib/cx';
import { Piano } from './Piano';
import { prettyProse } from './ReharmPanel.logic';

/** Scales listed before "more…". */
export const SCALE_CHIPS_COLLAPSED = 4;

/** Two octaves, C3 to C5: enough to see the shape without crowding the inspector. */
const HELPER_RANGE = [48, 72] as const;

export interface ScaleHelperProps {
  /** The chord being played now (jamStore.currentChord). */
  chord: Chord | null;
  /** Detection confidence; below MIN_DISPLAY_CONFIDENCE the last confident chord is kept. */
  confidence?: number;
  keyContext: Key | null;
  spellingFollowsKey?: boolean;
  /** @deprecated Accepted for compatibility; the panel always renders (its container owns visibility). */
  open?: boolean;
  /** @deprecated Accepted for compatibility; there is no header toggle. */
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

function ScaleRow({
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
  const reason = prettyProse(s.reason);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={reason}
      data-rank={s.rank}
      onClick={() => onPick(s.id)}
      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-headline text-label">{label}</span>
        <span className="mt-0.5 block text-footnote text-label-2">{reason}</span>
      </span>
      <Check
        aria-hidden
        className={cx('size-5 shrink-0 text-accent', active ? 'opacity-100' : 'opacity-0')}
      />
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

  if (!shown || ranked.length === 0) {
    return (
      <section aria-label="Scale helper" className={className}>
        <p className="text-subhead text-label-3">Play a chord to see scales that fit.</p>
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
  const symbol = prettyAccidentals(chordSymbol(shown, keyContext, { ...opts, showSlash: false }));

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
    <section aria-label="Scale helper" className={cx('flex flex-col gap-3', className)}>
      <p className="text-subhead text-label-2">
        over <span className="font-semibold text-label">{symbol}</span>
      </p>
      <div className="overflow-hidden rounded-cell bg-fill-4">
        <div
          role="radiogroup"
          aria-label="Scales that fit"
          className="flex flex-col [&>*+*]:hairline-t"
        >
          {visible.map((s) => (
            <ScaleRow
              key={s.id}
              s={s}
              label={labelOf(s)}
              active={s.id === selected.id}
              onPick={pick}
            />
          ))}
        </div>
        {(hiddenCount > 0 || expanded) && ranked.length > SCALE_CHIPS_COLLAPSED && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="flex min-h-11 w-full items-center px-3 text-left text-subhead text-accent transition-colors duration-100 hairline-t hover:bg-fill-4 active:bg-fill-3"
          >
            {expanded ? 'less' : `more… (${hiddenCount})`}
          </button>
        )}
      </div>
      <ol
        aria-label={`${labelOf(selected)} notes`}
        data-testid="scale-notes"
        className="flex flex-wrap gap-1.5"
      >
        {notes.map((n, i) => {
          const p = selected.pitchClasses[i];
          const tone = chordSet.has(p);
          return (
            <li key={p} data-chord-tone={tone || undefined}>
              <Badge
                tone={tone ? 'accent' : 'neutral'}
                title={i === 0 ? 'Root' : undefined}
                className={cx(
                  'min-w-8 justify-center tabular',
                  i === 0 && 'ring-1 ring-current/40 ring-inset',
                )}
              >
                {n}
              </Badge>
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
        className="max-h-36 w-full"
      />
    </section>
  );
});
