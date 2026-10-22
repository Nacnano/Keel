import type { SessionSummary } from '@/core';
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

/** Session summary: time per key, top repeating progressions with numerals, counts. */
export function SummaryCard({
  summary,
  durationSec,
  spellingFollowsKey = true,
  showSlash = true,
  className,
}: SummaryCardProps) {
  const card = cx('rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900', className);
  if (!summary) {
    return (
      <section aria-label="Summary" className={card}>
        <h2 className="mb-2 text-xs font-medium tracking-widest text-zinc-500 uppercase">
          Summary
        </h2>
        <p className="text-sm text-zinc-500">No summary yet for this session.</p>
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
    <section aria-label="Summary" className={card}>
      <h2 className="mb-3 text-xs font-medium tracking-widest text-zinc-500 uppercase">Summary</h2>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-300">Keys</h3>
          {summary.keys.length === 0 ? (
            <p className="text-sm text-zinc-500">No key detected.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summary.keys.map((k) => {
                const pct = Math.round((k.seconds / total) * 100);
                return (
                  <li key={`${k.key.tonic}:${k.key.mode}`} data-testid="summary-key">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-white">
                        {pretty(keyLabel(k.key, { spellingFollowsKey }))}
                      </span>
                      <span className="text-zinc-400 tabular-nums">
                        {clockLabel(k.seconds)} · {pct}%
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800"
                      aria-hidden
                    >
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-300">Top progressions</h3>
          {summary.topProgressions.length === 0 ? (
            <p className="text-sm text-zinc-500">No repeating progressions found.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {summary.topProgressions.map((p, i) => (
                <li
                  key={i}
                  data-testid="summary-progression"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-zinc-950/60 px-3 py-2"
                >
                  <span className="flex flex-wrap gap-2">
                    {p.chords.map((c, j) => (
                      <span key={j} className="flex flex-col items-center leading-tight">
                        <span className="text-base font-semibold text-white">
                          {pretty(chordSymbol(c, home, { spellingFollowsKey, showSlash }))}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {home ? pretty(romanNumeral(c, home)) : ''}
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className="ml-auto text-sm text-zinc-400 tabular-nums">×{p.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div>
            <dt className="text-xs text-zinc-500">Chords</dt>
            <dd className="text-2xl font-semibold text-white tabular-nums">{summary.chordCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Bookmarks</dt>
            <dd className="text-2xl font-semibold text-white tabular-nums">{summary.bookmarks}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
