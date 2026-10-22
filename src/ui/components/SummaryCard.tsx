import type { SessionSummary } from '@/core';
import { Group, Row } from '../kit';
import { chordSymbol, keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { romanNumeral } from '../lib/numeral';
import { clockLabel } from '../screens/review/timeline';

export interface SummaryCardProps {
  summary: SessionSummary | null;
  durationSec: number;
  spellingFollowsKey?: boolean;
  showSlash?: boolean;
  className?: string;
}

/** Session summary as inset groups: time per key, top repeating progressions, counts. */
export function SummaryCard({
  summary,
  durationSec,
  spellingFollowsKey = true,
  showSlash = true,
  className,
}: SummaryCardProps) {
  if (!summary) {
    return (
      <section aria-label="Summary" className={className}>
        <Group title="Summary">
          <Row label={<span className="text-label-2">No summary yet for this session.</span>} />
        </Group>
      </section>
    );
  }
  const home = summary.keys[0]?.key ?? null;
  const total = Math.max(
    1,
    durationSec,
    summary.keys.reduce((n, k) => n + k.seconds, 0),
  );

  return (
    <section aria-label="Summary" className={cx('flex flex-col gap-6', className)}>
      <Group title="Keys">
        {summary.keys.length === 0 ? (
          <Row label={<span className="text-label-2">No key detected.</span>} />
        ) : (
          summary.keys.map((k) => {
            const pct = Math.round((k.seconds / total) * 100);
            return (
              <Row
                key={`${k.key.tonic}:${k.key.mode}`}
                data-testid="summary-key"
                label={pretty(keyLabel(k.key, { spellingFollowsKey }))}
                accessory={
                  <span className="text-subhead tabular">
                    {clockLabel(k.seconds)} · {pct}%
                  </span>
                }
                detail={
                  <span
                    aria-hidden
                    className="mt-1.5 block h-1 overflow-hidden rounded-full bg-fill-3"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                }
              />
            );
          })
        )}
      </Group>

      <Group title="Top progressions">
        {summary.topProgressions.length === 0 ? (
          <Row label={<span className="text-label-2">No repeating progressions found.</span>} />
        ) : (
          summary.topProgressions.map((p, i) => (
            <div
              key={i}
              data-testid="summary-progression"
              className="flex min-h-11 items-center gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
                {p.chords.map((c, j) => (
                  <span key={j} className="flex flex-col items-center leading-tight">
                    <span className="text-body font-semibold text-label">
                      {pretty(chordSymbol(c, home, { spellingFollowsKey, showSlash }))}
                    </span>
                    <span className="text-caption font-medium text-accent">
                      {home ? pretty(romanNumeral(c, home)) : ''}
                    </span>
                  </span>
                ))}
              </span>
              <span className="text-subhead text-label-2 tabular">×{p.count}</span>
            </div>
          ))
        )}
      </Group>

      <Group>
        <Row label="Chords" accessory={<span className="tabular">{summary.chordCount}</span>} />
        <Row label="Bookmarks" accessory={<span className="tabular">{summary.bookmarks}</span>} />
      </Group>
    </section>
  );
}
