import { MIN_DISPLAY_CONFIDENCE } from '@/core';
import type { Chord, Key } from '@/core';
import { chordSymbol, chordTones, noteName, pretty } from '../lib/chordLabel';
import { romanNumeral } from '../lib/numeral';
import { cx } from '../lib/cx';
import { useFadeOnChange } from './useFadeOnChange';

export interface ChordDisplayProps {
  chord: Chord | null;
  confidence: number;
  /** Key context for the numeral and spelling. */
  keyContext?: Key | null;
  showSlash?: boolean;
  spellingFollowsKey?: boolean;
  /** Shown in the detail line when there is no chord (e.g. "Tap Start and allow the microphone"). */
  hint?: string;
  className?: string;
}

export const DASH = '—';

/** Base symbol size: at least 120 px on a 1024 px+ laptop, readable from the piano bench. */
const SYMBOL_SIZE = 'clamp(96px, 13vw, 208px)';

/**
 * The glanceable centre of the jam screen. Fixed-height rows so nothing jumps when the chord,
 * numeral or tone line appears or disappears.
 */
export function ChordDisplay({
  chord,
  confidence,
  keyContext = null,
  showSlash = true,
  spellingFollowsKey = true,
  hint,
  className,
}: ChordDisplayProps) {
  const shown = chord && confidence >= MIN_DISPLAY_CONFIDENCE ? chord : null;
  const spell = { spellingFollowsKey };
  const symbol = shown ? pretty(chordSymbol(shown, keyContext, { ...spell, showSlash })) : DASH;
  const numeral = shown && keyContext ? pretty(romanNumeral(shown, keyContext)) : '';
  const tones = shown ? chordTones(shown).map((pc) => pretty(noteName(pc, keyContext, spell))) : [];
  const bass = shown ? pretty(noteName(shown.bass ?? shown.root, keyContext, spell)) : '';
  const symbolRef = useFadeOnChange<HTMLSpanElement>(symbol);
  // Long symbols ("Cmaj7#11/E") shrink so they never wrap or overflow the column.
  const len = [...symbol].length;
  const scale = len <= 5 ? 1 : len <= 7 ? 0.8 : len <= 9 ? 0.64 : 0.52;

  return (
    <div className={cx('flex flex-col items-center justify-center text-center', className)}>
      <div
        aria-live="polite"
        aria-atomic="true"
        data-testid="chord-symbol"
        className="flex w-full items-center justify-center overflow-hidden"
        style={{ height: `calc(${SYMBOL_SIZE} * 1.1)` }}
      >
        <span
          ref={symbolRef}
          style={{ fontSize: `calc(${SYMBOL_SIZE} * ${scale})` }}
          className={cx(
            'leading-none font-semibold tracking-tight whitespace-nowrap',
            shown ? 'text-white' : 'text-zinc-700',
          )}
        >
          {shown ? (
            symbol
          ) : (
            <>
              <span aria-hidden>{DASH}</span>
              <span className="sr-only">No chord</span>
            </>
          )}
        </span>
      </div>
      <div
        data-testid="chord-numeral"
        className="mt-2 h-12 text-4xl font-medium text-violet-300 sm:text-5xl"
      >
        {numeral}
      </div>
      <div className="mt-3 flex h-7 items-center gap-5 text-lg text-zinc-400">
        {shown ? (
          <>
            <span className="flex gap-3 font-medium tracking-wide text-zinc-300">
              {tones.map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </span>
            <span className="text-zinc-600" aria-hidden>
              |
            </span>
            <span>
              bass <span className="font-medium text-zinc-300">{bass}</span>
            </span>
          </>
        ) : (
          <span className="text-base text-zinc-500">{hint}</span>
        )}
      </div>
    </div>
  );
}
