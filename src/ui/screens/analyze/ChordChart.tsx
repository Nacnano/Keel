import { memo } from 'react';
import type { Chord, Key } from '@/core';
import { chordSymbol, keyLabel, pretty } from '../../lib/chordLabel';
import { cx } from '../../lib/cx';
import { romanNumeral } from '../../lib/numeral';
import { clockLabel } from '../review/timeline';
import { cellTime, type Chart, type ChartPosition } from './chart';

export interface ChordChartProps {
  chart: Chart;
  position: ChartPosition | null;
  onSeek(t: number): void;
  spellingFollowsKey: boolean;
  showSlash: boolean;
}

/** Compressed chord chart (`| C G Am F | ×4`) with numerals; the sounding cell is lit. */
export function ChordChart({
  chart,
  position,
  onSeek,
  spellingFollowsKey,
  showSlash,
}: ChordChartProps) {
  if (!chart.items.length) {
    return (
      <p className="rounded-card bg-surface px-4 py-4 text-subhead text-label-2">
        No chords found. The file may be silent, mostly drums or speech, or very quiet.
      </p>
    );
  }
  const opts = { spellingFollowsKey };
  return (
    <section aria-label="Chord chart" className="flex flex-col gap-5">
      {chart.blocks.map((block, b) => (
        <div key={b} className="flex flex-col gap-2">
          {block.key && (
            <h3 className="px-1 text-footnote font-medium tracking-wide text-label-2 uppercase">
              {b === 0
                ? `Key ${pretty(keyLabel(block.key, opts))}`
                : `→ ${pretty(keyLabel(block.key, opts))} at ${clockLabel(block.t)}`}
            </h3>
          )}
          <ol className="flex flex-col gap-2">
            {block.segments.map((seg, s) => {
              const here = position?.block === b && position.segment === s ? position : null;
              return (
                <li
                  key={s}
                  data-testid="chart-segment"
                  className="flex items-start gap-2 rounded-card bg-surface p-2"
                >
                  <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5">
                    {seg.items.map((item, c) => (
                      <Cell
                        key={c}
                        chord={item.chord}
                        keyContext={block.key}
                        active={here?.cell === c}
                        at={cellTime(chart, seg, c, here?.pass ?? 1)}
                        onSeek={onSeek}
                        spellingFollowsKey={spellingFollowsKey}
                        showSlash={showSlash}
                      />
                    ))}
                  </div>
                  {seg.repeat > 1 && (
                    <span
                      className={cx(
                        'flex min-h-14 shrink-0 flex-col items-end justify-center px-2 text-subhead font-semibold tabular',
                        here ? 'text-accent' : 'text-label-2',
                      )}
                    >
                      ×{seg.repeat}
                      {here && (
                        <span className="text-caption font-normal text-label-3">
                          {' '}
                          pass {here.pass}
                        </span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}

interface CellProps {
  chord: Chord;
  keyContext: Key | null;
  active: boolean;
  at: number;
  onSeek(t: number): void;
  spellingFollowsKey: boolean;
  showSlash: boolean;
}

const Cell = memo(function Cell({
  chord,
  keyContext,
  active,
  at,
  onSeek,
  spellingFollowsKey,
  showSlash,
}: CellProps) {
  const symbol = pretty(chordSymbol(chord, keyContext, { spellingFollowsKey, showSlash }));
  const numeral = keyContext ? pretty(romanNumeral(chord, keyContext)) : '';
  // Long names ("Cm(add9)", "D♭maj7♯11/F") step down in size, then truncate; the title and
  // the accessible name keep the full symbol.
  const size =
    symbol.length <= 5 ? 'text-headline' : symbol.length <= 7 ? 'text-subhead' : 'text-footnote';
  return (
    <button
      type="button"
      data-testid="chart-chord"
      aria-current={active ? 'true' : undefined}
      aria-label={`${symbol}${numeral ? `, ${numeral}` : ''} at ${clockLabel(at)}`}
      title={numeral ? `${symbol} · ${numeral}` : symbol}
      onClick={() => onSeek(at)}
      className={cx(
        'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-cell px-1 py-1.5 transition-colors duration-100',
        active ? 'bg-accent/15 text-accent' : 'bg-fill-4 text-label hover:bg-fill-3',
      )}
    >
      <span className={cx('max-w-full truncate leading-tight font-semibold', size)}>{symbol}</span>
      {numeral && (
        <span
          className={cx(
            'max-w-full truncate text-caption',
            active ? 'text-accent' : 'text-label-2',
          )}
        >
          {numeral}
        </span>
      )}
    </button>
  );
});
