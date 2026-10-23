import { Fragment, useMemo, useState } from 'react';
import type { Chord, Key } from '@/core';
import { chartLines, type SessionFull } from '@/data';
import { chordSymbol, keyLabel, pretty } from '../../lib/chordLabel';
import { clockLabel } from './timeline';

export interface ChartCardProps {
  full: Pick<SessionFull, 'chords' | 'keys' | 'markers'>;
  spellingFollowsKey: boolean;
  showSlash: boolean;
}

/** Lines shown before "Show the whole chart". */
const PREVIEW_LINES = 8;

/**
 * The session as a chord chart in large type, the same lines as the shared text chart:
 * one line per loop (`| C G Am F | ×4`) or run of chords, section headings, key changes.
 */
export function ChartCard({ full, spellingFollowsKey, showSlash }: ChartCardProps) {
  const lines = useMemo(() => chartLines(full), [full]);
  const [expanded, setExpanded] = useState(false);
  if (!lines.some((l) => l.type === 'chords' && l.bars.length)) return null;

  const shown = expanded ? lines : lines.slice(0, PREVIEW_LINES);
  // Indent unlabelled lines under the bars only when some line has a section heading.
  const labelled = lines.some((l) => l.type === 'chords' && l.section !== null);
  const name = (c: Chord, key: Key | null) =>
    pretty(chordSymbol(c, key, { spellingFollowsKey, showSlash }));

  return (
    <section aria-label="Chord chart" className="rounded-card bg-surface px-4 py-3">
      <ol data-testid="review-chart" className="flex flex-col gap-2">
        {shown.map((line, i) =>
          line.type === 'key' ? (
            <li key={i} className="text-subhead font-medium text-label-2">
              → {pretty(keyLabel(line.key, { spellingFollowsKey }))} at {clockLabel(line.t)}
            </li>
          ) : (
            <li
              key={i}
              data-testid="chart-line"
              className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4"
            >
              {line.section !== null && (
                <span className="shrink-0 text-footnote font-semibold text-label-2 sm:w-24">
                  {line.section}
                </span>
              )}
              <span
                className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 text-title-3 font-semibold text-label ${
                  labelled && line.section === null ? 'sm:pl-28' : ''
                }`}
              >
                {line.bars.map((bar, b) => (
                  <Fragment key={b}>
                    <span aria-hidden className="font-normal text-label-4">
                      |
                    </span>
                    {bar.chords.map((c, k) => (
                      <span key={k}>{name(c, line.key)}</span>
                    ))}
                    <span aria-hidden className="font-normal text-label-4">
                      |
                    </span>
                    {bar.repeat > 1 && (
                      <span className="text-callout font-semibold text-accent tabular">
                        <span className="sr-only">repeat </span>×{bar.repeat}
                      </span>
                    )}
                  </Fragment>
                ))}
              </span>
            </li>
          ),
        )}
      </ol>
      {lines.length > PREVIEW_LINES && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 -mb-1 min-h-11 text-subhead font-medium text-accent hover:underline"
        >
          {expanded ? 'Show less' : `Show the whole chart (${lines.length} lines)`}
        </button>
      )}
    </section>
  );
}
