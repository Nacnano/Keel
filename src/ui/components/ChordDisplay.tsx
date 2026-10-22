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
  /** Shown in the detail line when there is no chord (e.g. "Tap Start, then play"). */
  hint?: string;
  /** Idle (not listening): show a quiet placeholder mark instead of the dash. */
  idle?: boolean;
  className?: string;
  /** Detailed tones and bass are optional during a focused listening session. */
  details?: boolean;
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
  idle,
  className,
  details = true,
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
            'leading-none font-semibold tracking-[-0.03em] whitespace-nowrap',
            shown ? 'text-label' : 'text-label-4',
          )}
        >
          {shown ? (
            symbol
          ) : idle ? (
            <>
              <span
                aria-hidden
                className="inline-flex size-[0.6em] items-center justify-center rounded-full bg-fill-4 text-[0.28em] text-label-3"
              >
                ♪
              </span>
              <span className="sr-only">Not listening</span>
            </>
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
        className={cx(
          'mt-3 font-medium text-accent',
          details ? 'h-12 text-4xl sm:text-5xl' : 'min-h-8 text-2xl',
        )}
      >
        {numeral}
      </div>
      {details && (
        <div className="mt-3 flex h-7 items-center gap-5 text-body text-label-2">
          {shown ? (
            <>
              <span className="flex gap-3 font-medium tracking-wide text-label">
                {tones.map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </span>
              <span className="text-label-4" aria-hidden>
                |
              </span>
              <span>
                bass <span className="font-medium text-label">{bass}</span>
              </span>
            </>
          ) : (
            <span className="max-w-md text-balance text-callout text-label-2">{hint}</span>
          )}
        </div>
      )}
    </div>
  );
}
