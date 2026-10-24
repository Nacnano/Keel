import { useMemo } from 'react';
import { buildChart, type ChartInput } from '@/data';
import { ChordChart } from '../../components/ChordChart';
import { cx } from '../../lib/cx';

export interface ChartCardProps {
  /** Chords, keys and markers (a `SessionFull` also lends its duration). */
  full: ChartInput;
  spellingFollowsKey: boolean;
  showSlash: boolean;
  /** Playback position: lights the sounding chord. */
  time?: number;
  /** Chords become buttons that jump there. */
  onSeek?(t: number): void;
  /** Rows before "Show the whole chart" (default 8). */
  previewRows?: number;
  className?: string;
}

/** The session's folded chord chart on a card (Review, the Finished screen). */
export function ChartCard({
  full,
  spellingFollowsKey,
  showSlash,
  time,
  onSeek,
  previewRows = 8,
  className,
}: ChartCardProps) {
  const chart = useMemo(
    () =>
      buildChart(
        full.durationSec === undefined && 'session' in full
          ? {
              ...full,
              durationSec: (full as { session: { durationSec: number } }).session.durationSec,
            }
          : full,
      ),
    [full],
  );
  if (!chart.parts.some((p) => p.type === 'section')) return null;
  return (
    <div data-testid="review-chart" className={cx('rounded-card bg-surface px-4 py-3', className)}>
      <ChordChart
        chart={chart}
        spellingFollowsKey={spellingFollowsKey}
        showSlash={showSlash}
        time={time}
        onSeek={onSeek}
        previewRows={previewRows}
      />
    </div>
  );
}
