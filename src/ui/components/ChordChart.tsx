import { memo, useMemo, useState } from 'react';
import type { Chord, Key } from '@/core';
import { chartNumeral, chartSymbol, type Chart, type ChartSegment } from '@/data';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { clockLabel } from '../screens/review/timeline';

export interface ChordChartProps {
  chart: Chart;
  spellingFollowsKey: boolean;
  showSlash: boolean;
  /** Playback position in seconds: the sounding chord is lit. */
  time?: number;
  /** Makes every chord a button that jumps to it. */
  onSeek?(t: number): void;
  /** Rows shown before "Show the whole chart"; all rows when omitted. */
  previewRows?: number;
  className?: string;
}

interface Lit {
  part: number;
  row: number;
  seg: number;
  /** Index into the segment's spans: cell = i % chords. */
  span: number;
}

/** The chord sounding at `time`, or null in a gap. */
function locate(chart: Chart, time: number | undefined): Lit | null {
  if (time === undefined) return null;
  for (let p = 0; p < chart.parts.length; p++) {
    const part = chart.parts[p];
    if (part.type !== 'section') continue;
    for (let r = 0; r < part.rows.length; r++) {
      const row = part.rows[r];
      for (let s = 0; s < row.length; s++) {
        const i = row[s].spans.findIndex((x) => time >= x.t && time < x.end);
        if (i >= 0) return { part: p, row: r, seg: s, span: i };
      }
    }
  }
  return null;
}

/**
 * Cell widths, like bars on a lead sheet: four chords and a `×N` per line on a compact card.
 * On a wide card two rows share a line (eight chords), and a section of one row grows to fill
 * it, up to a quarter of the card per chord. A longer name widens its cell and the row
 * wraps inside the card instead of running off it.
 */
const CELL =
  'grow min-w-[calc((100cqw-3rem)/4)] @xl:min-w-[calc((100cqw-6rem)/8)] @xl:max-w-[calc((100cqw-3rem)/4)]';
const REPEAT = 'w-11 shrink-0';

/**
 * The folded chord chart, the same on Review, Analyze, the Finished screen and the shared
 * page: song headings for a set, section titles, one row per loop (`[C G Am F] ×4`) with the
 * numerals under the chords, and key changes that lasted at least ten seconds.
 */
export function ChordChart({
  chart,
  spellingFollowsKey,
  showSlash,
  time,
  onSeek,
  previewRows,
  className,
}: ChordChartProps) {
  const [expanded, setExpanded] = useState(false);
  const lit = useMemo(() => locate(chart, time), [chart, time]);
  const total = chart.parts.reduce((n, p) => n + (p.type === 'section' ? p.rows.length : 0), 0);
  const limit = !expanded && previewRows !== undefined && total > previewRows ? previewRows : null;
  const label = (key: Key) => pretty(keyLabel(key, { spellingFollowsKey }));

  let budget = limit ?? Infinity;
  const parts = [];
  for (let p = 0; p < chart.parts.length && budget > 0; p++) {
    const part = chart.parts[p];
    if (part.type === 'song') {
      parts.push(
        <h2
          key={p}
          data-testid="chart-song"
          className={cx('text-headline text-label', part.n > 1 && 'mt-3')}
        >
          Song {part.n}
          {part.key && <span className="font-normal text-label-2"> · {label(part.key)}</span>}
        </h2>,
      );
      continue;
    }
    if (part.type === 'key') {
      parts.push(
        <p key={p} className="text-subhead font-medium text-label-2">
          → {label(part.key)} at {clockLabel(part.t)}
        </p>,
      );
      continue;
    }
    const rows = part.rows.slice(0, budget);
    budget -= rows.length;
    parts.push(
      <div key={p} className="flex flex-col gap-1.5" data-testid="chart-section">
        {part.title && <h3 className="text-footnote font-semibold text-label-2">{part.title}</h3>}
        <div className="-ml-1.5 flex flex-wrap gap-y-1.5">
          {rows.map((row, r) => (
            <div
              key={r}
              data-testid="chart-row"
              className={cx(
                'flex max-w-full flex-wrap items-stretch gap-y-1.5',
                // A section of one row fills the card; longer ones keep eight even columns.
                part.rows.length === 1 && '@xl:grow',
              )}
            >
              {row.map((seg, s) => (
                <Segment
                  key={s}
                  seg={seg}
                  keyContext={part.key}
                  lit={lit && lit.part === p && lit.row === r && lit.seg === s ? lit.span : null}
                  onSeek={onSeek}
                  spellingFollowsKey={spellingFollowsKey}
                  showSlash={showSlash}
                />
              ))}
            </div>
          ))}
        </div>
      </div>,
    );
  }

  return (
    <section aria-label="Chord chart" className={cx('@container flex flex-col', className)}>
      <div data-testid="chord-chart" className="flex flex-col gap-4">
        {parts}
      </div>
      {previewRows !== undefined && total > previewRows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 -mb-1 min-h-11 self-start text-subhead font-medium text-accent hover:underline"
        >
          {expanded ? 'Show less' : `Show the whole chart (${total} rows)`}
        </button>
      )}
    </section>
  );
}

interface SegmentProps {
  seg: ChartSegment;
  keyContext: Key | null;
  /** Lit span index in this segment. */
  lit: number | null;
  onSeek?(t: number): void;
  spellingFollowsKey: boolean;
  showSlash: boolean;
}

function Segment({ seg, keyContext, lit, onSeek, spellingFollowsKey, showSlash }: SegmentProps) {
  const len = seg.chords.length;
  const cell = lit === null ? -1 : lit % len;
  const pass = lit === null ? 0 : Math.floor(lit / len);
  const loop = seg.repeat > 1;
  const cells = seg.chords.map((c, i) => (
    <Cell
      key={i}
      chord={c}
      keyContext={keyContext}
      active={i === cell}
      at={seg.spans[pass * len + i]?.t ?? seg.spans[i].t}
      onSeek={onSeek}
      spellingFollowsKey={spellingFollowsKey}
      showSlash={showSlash}
    />
  ));
  if (!loop) return cells;
  return (
    <span
      data-testid="chart-segment"
      className="inline-flex max-w-full flex-wrap items-stretch rounded-cell bg-fill-4"
      style={{ flexGrow: len }}
    >
      {cells}
      <span
        className={cx(
          REPEAT,
          'flex items-center pl-1 text-callout font-semibold tabular',
          lit !== null ? 'text-accent' : 'text-label-2',
        )}
      >
        <span className="sr-only">repeat </span>×{seg.repeat}
      </span>
    </span>
  );
}

interface CellProps {
  chord: Chord;
  keyContext: Key | null;
  active: boolean;
  at: number;
  onSeek?(t: number): void;
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
  const symbol = chartSymbol(chord, keyContext, { spellingFollowsKey, showSlash });
  const numeral = chartNumeral(chord, keyContext);
  const body = (
    <>
      <span className="text-headline leading-tight font-semibold whitespace-nowrap @xl:text-title-3">
        {symbol}
      </span>
      <span
        data-testid="chart-numeral"
        className={cx(
          'h-4 text-caption leading-4 font-medium whitespace-nowrap',
          active ? 'text-accent' : 'text-accent/80',
        )}
      >
        {numeral || ' '}
      </span>
    </>
  );
  const look = cx(
    CELL,
    'flex min-h-11 flex-col items-start justify-center rounded-cell px-1.5 py-1 text-left transition-colors duration-100',
    active ? 'bg-accent/15 text-accent' : 'text-label',
  );
  if (!onSeek) {
    return (
      <span data-testid="chart-chord" className={look}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="chart-chord"
      aria-current={active ? 'true' : undefined}
      aria-label={`${symbol}${numeral ? `, ${numeral}` : ''} at ${clockLabel(at)}`}
      onClick={() => onSeek(at)}
      className={cx(look, !active && 'hover:bg-fill-3')}
    >
      {body}
    </button>
  );
});
