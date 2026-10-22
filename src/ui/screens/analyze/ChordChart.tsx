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
      <p className="rounded-2xl bg-zinc-900/40 p-5 text-sm text-zinc-400 ring-1 ring-zinc-900">
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
            <h3 className="text-xs font-semibold tracking-widest text-violet-200 uppercase">
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
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span aria-hidden className="text-lg text-zinc-700">
                    |
                  </span>
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
                  <span aria-hidden className="text-lg text-zinc-700">
                    |
                  </span>
                  {seg.repeat > 1 && (
                    <span
                      className={cx(
                        'ml-1 text-sm tabular-nums',
                        here ? 'text-violet-200' : 'text-zinc-400',
                      )}
                    >
                      ×{seg.repeat}
                      {here && <span className="text-zinc-500"> · pass {here.pass}</span>}
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
  return (
    <button
      type="button"
      data-testid="chart-chord"
      aria-current={active ? 'true' : undefined}
      aria-label={`${symbol}${numeral ? `, ${numeral}` : ''} at ${clockLabel(at)}`}
      onClick={() => onSeek(at)}
      className={cx(
        'flex min-h-14 min-w-16 flex-col items-center justify-center rounded-xl px-3 py-1.5 transition-colors duration-100',
        'focus-visible:outline-2 focus-visible:outline-violet-300',
        active
          ? 'bg-violet-400/20 text-white ring-1 ring-violet-300'
          : 'bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800 hover:bg-zinc-800',
      )}
    >
      <span className="text-lg leading-tight font-semibold">{symbol}</span>
      {numeral && (
        <span className={cx('text-xs', active ? 'text-violet-200' : 'text-zinc-500')}>
          {numeral}
        </span>
      )}
    </button>
  );
});
