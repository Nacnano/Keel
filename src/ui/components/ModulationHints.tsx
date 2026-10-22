import { useId, useMemo } from 'react';
import type { Chord, Key, VocabLevel } from '@/core';
import {
  chordSymbol,
  keyName,
  modulationHints,
  prettyAccidentals,
  type ModulationHint,
} from '@/theory';
import { cx } from '../lib/cx';

export interface ModulationHintsProps {
  keyContext: Key | null;
  level: VocabLevel;
  onAudition?(chord: Chord): void;
  spellingFollowsKey?: boolean;
  className?: string;
}

function HintChip({
  hint,
  from,
  spellingFollowsKey,
  onAudition,
}: {
  hint: ModulationHint;
  from: Key;
  spellingFollowsKey: boolean;
  onAudition?(chord: Chord): void;
}) {
  const tipId = useId();
  const to = prettyAccidentals(keyName(hint.to, { spellingFollowsKey }));
  const pivot = prettyAccidentals(chordSymbol(hint.pivot, from, { spellingFollowsKey }));
  const numerals = prettyAccidentals(`${hint.pivotNumeralFrom} → ${hint.pivotNumeralTo}`);
  return (
    <li className="group relative">
      <button
        type="button"
        data-testid="modulation-hint"
        aria-label={`${to}: hear pivot ${pivot}, ${numerals}`}
        aria-describedby={tipId}
        onClick={() => onAudition?.(hint.pivot)}
        className={cx(
          'flex min-h-9 items-baseline gap-1.5 rounded-lg bg-zinc-900/70 px-2.5 py-1 text-sm ring-1 ring-zinc-800',
          'transition-colors duration-150 hover:bg-zinc-800 hover:ring-violet-400/40',
          'focus-visible:outline-2 focus-visible:outline-violet-300',
        )}
      >
        <span className="font-medium text-zinc-200">{to}</span>
        <span className="text-zinc-600">via</span>
        <span className="font-semibold text-zinc-100">{pivot}</span>
        <span className="text-xs text-violet-300/70">{numerals}</span>
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
        {prettyAccidentals(hint.reason)}
      </span>
    </li>
  );
}

/** Compact "modulate to" chips under Try next; tap to hear the pivot chord. Hidden without a key. */
export function ModulationHints({
  keyContext,
  level,
  onAudition,
  spellingFollowsKey = true,
  className,
}: ModulationHintsProps) {
  const tonic = keyContext?.tonic;
  const mode = keyContext?.mode;
  const from = useMemo<Key | null>(
    () => (tonic === undefined || !mode ? null : { tonic, mode }),
    [tonic, mode],
  );
  const hints = useMemo(() => (from ? modulationHints(from, level) : []), [from, level]);
  if (!from || hints.length === 0) return null;
  return (
    <section aria-label="Modulation hints" className={cx('flex flex-col gap-1.5', className)}>
      <h2 className="text-xs font-medium tracking-widest text-zinc-500 uppercase">Modulate to</h2>
      <ul className="flex flex-wrap gap-1.5">
        {hints.map((h) => (
          <HintChip
            key={`${h.to.tonic}:${h.to.mode}`}
            hint={h}
            from={from}
            spellingFollowsKey={spellingFollowsKey}
            onAudition={onAudition}
          />
        ))}
      </ul>
    </section>
  );
}
