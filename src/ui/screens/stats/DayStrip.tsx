import type { DayStat } from '@/data';
import { dayLabel, durationLabel, durationSpoken } from './format';

const HEIGHT = 96;
/** Minimum visible height for a day with any playing, so short jams still show. */
const MIN_BAR = 4;
const RADIUS = 3;

export interface DayStripProps {
  days: readonly DayStat[];
}

/**
 * Time played per day as thin bars (pure SVG). x / width are percentages and y / height are
 * pixels, so the strip stretches to any width without distorting the rounded bar tops.
 */
export function DayStrip({ days }: DayStripProps) {
  if (!days.length) return null;
  const max = Math.max(...days.map((d) => d.seconds));
  const slot = 100 / days.length;
  // 2px-ish gap between bars at typical widths; thin bars on long ranges.
  const barPct = slot * (days.length > 40 ? 0.7 : 0.6);
  const played = days.filter((d) => d.seconds > 0).length;
  const best = days.reduce((a, b) => (b.seconds > a.seconds ? b : a), days[0]);
  const label =
    `Time played per day, ${dayLabel(days[0].day)} to ${dayLabel(days.at(-1)!.day)}. ` +
    `Played on ${played} of ${days.length} days` +
    (max > 0 ? `; most on ${dayLabel(best.day)}, ${durationSpoken(best.seconds)}.` : '.');

  return (
    <figure className="flex flex-col gap-1.5">
      <svg
        role="img"
        aria-label={label}
        width="100%"
        height={HEIGHT}
        className="block overflow-visible"
        data-testid="day-strip"
      >
        <line
          x1="0"
          x2="100%"
          y1={HEIGHT - 0.5}
          y2={HEIGHT - 0.5}
          className="stroke-separator"
          strokeWidth={1}
        />
        {days.map((d, i) => {
          const h = d.seconds > 0 ? Math.max(MIN_BAR, (d.seconds / max) * (HEIGHT - 4)) : 0;
          const x = `${i * slot + (slot - barPct) / 2}%`;
          const w = `${barPct}%`;
          const tip = `${dayLabel(d.day, { weekday: 'short' })}: ${
            d.seconds > 0
              ? `${durationLabel(d.seconds)}, ${d.sessions} session${d.sessions === 1 ? '' : 's'}`
              : 'no jams'
          }`;
          return (
            <g key={d.day} className="group" data-testid="day-bar">
              <title>{tip}</title>
              {/* Hit target: the whole column, larger than the bar. */}
              <rect
                x={`${i * slot}%`}
                width={`${slot}%`}
                y={0}
                height={HEIGHT}
                fill="transparent"
              />
              {h > 0 && (
                <>
                  <rect
                    x={x}
                    width={w}
                    y={HEIGHT - h}
                    height={h}
                    rx={RADIUS}
                    className="fill-accent transition-[filter] group-hover:brightness-125"
                  />
                  {/* Square off the bottom so the bar sits flat on the baseline. */}
                  <rect
                    x={x}
                    width={w}
                    y={HEIGHT - Math.min(h, RADIUS)}
                    height={Math.min(h, RADIUS)}
                    className="fill-accent transition-[filter] group-hover:brightness-125"
                  />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-caption text-label-3 tabular" aria-hidden>
        <span>{dayLabel(days[0].day)}</span>
        {max > 0 && <span>Most: {durationLabel(max)}</span>}
        <span>{dayLabel(days.at(-1)!.day)}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Time played per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Time</th>
            <th scope="col">Sessions</th>
          </tr>
        </thead>
        <tbody>
          {days
            .filter((d) => d.sessions > 0)
            .map((d) => (
              <tr key={d.day}>
                <th scope="row">{dayLabel(d.day, { weekday: 'long' })}</th>
                <td>{durationSpoken(d.seconds)}</td>
                <td>{d.sessions}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}
