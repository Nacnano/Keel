import type { SessionSummary } from '@/core';
import { Group, Row } from '../kit';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { clockLabel } from '../screens/review/timeline';

export interface SummaryCardProps {
  summary: SessionSummary | null;
  durationSec: number;
  spellingFollowsKey?: boolean;
  className?: string;
}

/** Session summary as inset groups: time per key and counts (the chart shows the loops). */
export function SummaryCard({
  summary,
  durationSec,
  spellingFollowsKey = true,
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

      <Group>
        <Row label="Chords" accessory={<span className="tabular">{summary.chordCount}</span>} />
        <Row label="Bookmarks" accessory={<span className="tabular">{summary.bookmarks}</span>} />
      </Group>
    </section>
  );
}
