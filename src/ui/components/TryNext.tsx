import type { Chord, Key } from '@/core';
import { chordSymbol, pretty } from '../lib/chordLabel';
import { romanNumeral } from '../lib/numeral';
import { cx } from '../lib/cx';

export interface TryNextSuggestion {
  chord: Chord;
  reason: string;
}

export interface TryNextProps {
  suggestions: readonly TryNextSuggestion[];
  keyContext: Key | null;
  onAudition?(chord: Chord): void;
  spellingFollowsKey?: boolean;
  /** List layout with reasons (inspector) instead of a chip row. */
  detailed?: boolean;
  className?: string;
}

/** Chords that fit next. Tap to hear one. */
export function TryNext({
  suggestions,
  keyContext,
  onAudition,
  spellingFollowsKey = true,
  detailed,
  className,
}: TryNextProps) {
  if (suggestions.length === 0) {
    return (
      <p className={cx('text-subhead text-label-3', className)}>
        Suggestions appear once a key is found.
      </p>
    );
  }
  return (
    <ul
      aria-label="Try next"
      className={cx(
        detailed
          ? 'flex flex-col overflow-hidden rounded-cell bg-fill-4 [&>li+li]:hairline-t'
          : 'flex flex-wrap gap-2',
        className,
      )}
    >
      {suggestions.map((s, i) => {
        const symbol = pretty(chordSymbol(s.chord, keyContext, { spellingFollowsKey }));
        const numeral = keyContext ? pretty(romanNumeral(s.chord, keyContext)) : '';
        // Reasons often start with the numeral ("V7: dominant"); it is already shown beside it.
        const reason = s.reason.replace(/^[^\s:]{1,12}:\s+/, '');
        return (
          <li key={`${s.chord.root}-${s.chord.quality}-${i}`}>
            <button
              type="button"
              title={s.reason}
              aria-label={`${symbol}${numeral ? `, ${numeral}` : ''}. ${s.reason}. Play`}
              onClick={() => onAudition?.(s.chord)}
              className={cx(
                'transition-colors duration-100 active:bg-fill-3',
                detailed
                  ? 'flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-fill-4'
                  : 'flex h-11 items-center gap-2 rounded-control bg-fill-3 px-3.5 hover:bg-fill-2',
              )}
            >
              <span className="text-title-3 font-semibold text-label">{symbol}</span>
              <span className="text-footnote font-medium text-accent">{numeral}</span>
              {detailed && (
                <span className="ml-auto max-w-[55%] truncate text-footnote text-label-2">
                  {reason.charAt(0).toUpperCase() + reason.slice(1)}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
