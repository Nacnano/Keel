import { useId } from 'react';
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
  className?: string;
}

function Chip({
  s,
  keyContext,
  spellingFollowsKey,
  onAudition,
}: {
  s: TryNextSuggestion;
  keyContext: Key | null;
  spellingFollowsKey: boolean;
  onAudition?(chord: Chord): void;
}) {
  const tipId = useId();
  const symbol = pretty(chordSymbol(s.chord, keyContext, { spellingFollowsKey }));
  const numeral = keyContext ? pretty(romanNumeral(s.chord, keyContext)) : '';
  return (
    <li className="group relative">
      <button
        type="button"
        aria-describedby={tipId}
        onClick={() => onAudition?.(s.chord)}
        className={cx(
          'flex min-h-12 items-baseline gap-2 rounded-xl bg-zinc-900 px-4 py-2 ring-1 ring-zinc-800',
          'transition-colors duration-150 hover:bg-zinc-800 hover:ring-violet-400/40',
          'focus-visible:outline-2 focus-visible:outline-violet-300',
        )}
      >
        <span className="text-xl font-semibold text-zinc-100">{symbol}</span>
        {numeral && <span className="text-sm text-violet-300/80">{numeral}</span>}
      </button>
      <span
        id={tipId}
        role="tooltip"
        className={cx(
          'pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-lg',
          'bg-zinc-800 px-2.5 py-1 text-xs whitespace-nowrap text-zinc-200 shadow-lg',
          'opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
      >
        {pretty(s.reason)}
      </span>
    </li>
  );
}

/** "Try next" chips; hover/focus shows the reason, tap auditions the chord. */
export function TryNext({
  suggestions,
  keyContext,
  onAudition,
  spellingFollowsKey = true,
  className,
}: TryNextProps) {
  return (
    <section aria-label="Try next" className={cx('flex flex-col gap-2', className)}>
      <h2 className="text-xs font-medium tracking-widest text-zinc-500 uppercase">Try next</h2>
      {suggestions.length === 0 ? (
        <p className="flex min-h-12 items-center text-sm text-zinc-600">
          Suggestions appear once a key is found.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Chip
              key={`${s.chord.root}:${s.chord.quality}:${s.chord.bass ?? ''}`}
              s={s}
              keyContext={keyContext}
              spellingFollowsKey={spellingFollowsKey}
              onAudition={onAudition}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
