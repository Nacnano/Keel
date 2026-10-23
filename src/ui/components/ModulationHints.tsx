import { useId, useMemo } from 'react';
import { Play } from 'lucide-react';
import type { Chord, Key, VocabLevel } from '@/core';
import {
  chordSymbol,
  keyName,
  modulationHints,
  prettyAccidentals,
  type ModulationHint,
} from '@/theory';
import { cx } from '../lib/cx';
import { prettyProse } from './ReharmPanel.logic';

export interface ModulationHintsProps {
  keyContext: Key | null;
  level: VocabLevel;
  onAudition?(chord: Chord): void;
  spellingFollowsKey?: boolean;
  className?: string;
}

function HintRow({
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
  const reasonId = useId();
  const to = prettyAccidentals(keyName(hint.to, { spellingFollowsKey }));
  const pivot = prettyAccidentals(chordSymbol(hint.pivot, from, { spellingFollowsKey }));
  const numerals = prettyAccidentals(`${hint.pivotNumeralFrom} → ${hint.pivotNumeralTo}`);
  const reason = prettyProse(hint.reason);
  return (
    <li>
      <button
        type="button"
        data-testid="modulation-hint"
        aria-label={`${to}: hear pivot ${pivot}, ${numerals}`}
        aria-describedby={reasonId}
        title={reason}
        onClick={() => onAudition?.(hint.pivot)}
        className="group flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-headline text-label">{to}</span>
          <span className="mt-0.5 block text-footnote text-label-2">
            via <span className="font-semibold text-label">{pivot}</span> ·{' '}
            <span className="text-accent">{numerals}</span>
          </span>
          <span id={reasonId} className="sr-only">
            {reason}
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

/** Keys to modulate to from the current key; tap a row to hear the pivot chord. */
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
  if (!from || hints.length === 0) {
    return (
      <p className={cx('text-subhead text-label-3', className)}>
        Keys to modulate to appear once a key is found.
      </p>
    );
  }
  return (
    <section aria-label="Modulation hints" className={className}>
      <ul className="flex flex-col overflow-hidden rounded-cell bg-fill-4 [&>li+li]:hairline-t">
        {hints.map((h) => (
          <HintRow
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
