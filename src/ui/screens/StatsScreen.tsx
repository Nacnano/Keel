import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { loadStats, type Stats, type StatsRange } from '@/data';
import { chordSymbol, keyName, prettyAccidentals as pretty, romanNumeral } from '@/theory';
import { useSettings } from '@/state/settingsStore';
import { Segmented } from '../components/Segmented';
import { cx } from '../lib/cx';
import { DayStrip } from './stats/DayStrip';
import { durationLabel, durationSpoken, jamInKeyHref, qualityName } from './stats/format';

const RANGE_OPTIONS: Array<{ value: StatsRange; label: string; title: string }> = [
  { value: '7d', label: '7d', title: 'Last 7 days' },
  { value: '30d', label: '30d', title: 'Last 30 days' },
  { value: 'all', label: 'All', title: 'All time' },
];

const RANGE_TEXT: Record<StatsRange, string> = {
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
  all: 'yet',
};

const TOP_PROGRESSIONS = 5;
const NUDGES = 3;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** `/stats`: practice stats computed on this device from saved sessions. */
export function StatsScreen() {
  const spellingFollowsKey = useSettings((s) => s.spellingFollowsKey);
  const showSlash = useSettings((s) => s.showSlashChords);
  const [range, setRange] = useState<StatsRange>('30d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadStats(range).then(
      (s) => {
        if (!alive) return;
        setStats(s);
        setError(null);
      },
      (err: unknown) => {
        if (!alive) return;
        setError(errorText(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [range]);

  // Streaks span every session, so a zero longest streak means nothing is saved at all.
  const nothingSaved = stats !== null && stats.streak.longest === 0;
  const emptyRange = stats !== null && stats.sessionCount === 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-24 lg:px-8">
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold text-white">Stats</h1>
            <p className="text-sm text-zinc-500">Worked out on this device from your saved jams.</p>
          </div>
          {!nothingSaved && (
            <Segmented<StatsRange>
              aria-label="Time range"
              options={RANGE_OPTIONS}
              value={range}
              onChange={setRange}
            />
          )}
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30"
          >
            Could not read your sessions: {error}
          </div>
        )}

        {stats === null ? (
          !error && (
            <p role="status" className="py-16 text-center text-zinc-500">
              Loading…
            </p>
          )
        ) : nothingSaved ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <h2 className="text-xl font-semibold text-white">No jams to count yet</h2>
            <p className="max-w-md text-sm text-zinc-400">
              Once you save a few jams, this page shows how long you play, your streaks, the keys
              you lean on and the progressions you come back to.
            </p>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-xl bg-violet-400 px-5 text-sm font-semibold text-zinc-950 hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
            >
              Start a jam
            </Link>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile
                label="Time played"
                value={durationLabel(stats.totalSeconds)}
                spoken={durationSpoken(stats.totalSeconds)}
              />
              <Tile label="Sessions" value={String(stats.sessionCount)} />
              <Tile
                label="Current streak"
                value={days(stats.streak.current)}
                accent={stats.streak.current > 0}
              />
              <Tile label="Longest streak" value={days(stats.streak.longest)} />
            </dl>

            {emptyRange ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-zinc-300">No jams {RANGE_TEXT[range]}.</p>
                <button
                  type="button"
                  onClick={() => setRange('all')}
                  className="min-h-11 rounded-xl px-4 text-sm text-violet-200 hover:bg-zinc-800/70 focus-visible:outline-2 focus-visible:outline-violet-300"
                >
                  Show all time
                </button>
              </div>
            ) : (
              <>
                <Card title="Time per day">
                  <DayStrip days={stats.perDay} />
                </Card>

                <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <Card title="Keys you play">
                    {stats.keys.length === 0 ? (
                      <Muted>No keys detected yet.</Muted>
                    ) : (
                      <KeyList stats={stats} spellingFollowsKey={spellingFollowsKey} />
                    )}
                  </Card>

                  <Card title="Top progressions">
                    {stats.progressions.length === 0 ? (
                      <Muted>
                        No repeating progressions yet. Loop a few chords and they show here.
                      </Muted>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {stats.progressions.slice(0, TOP_PROGRESSIONS).map((p, i) => (
                          <li
                            key={i}
                            data-testid="stats-progression"
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-zinc-950/60 px-3 py-2"
                          >
                            <span className="flex flex-wrap gap-3">
                              {p.chords.map((c, j) => (
                                <span key={j} className="flex flex-col items-center leading-tight">
                                  <span className="text-base font-semibold text-white">
                                    {pretty(
                                      chordSymbol(c, p.key, { spellingFollowsKey, showSlash }),
                                    )}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {p.key ? pretty(romanNumeral(c, p.key)) : ''}
                                  </span>
                                </span>
                              ))}
                            </span>
                            <span className="ml-auto text-right text-sm text-zinc-400 tabular-nums">
                              ×{p.count}
                              <span className="block text-xs text-zinc-500">
                                {p.sessions} session{p.sessions === 1 ? '' : 's'}
                                {p.key && ` · ${pretty(keyName(p.key, { spellingFollowsKey }))}`}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>
                </div>

                <Card title="Chord qualities">
                  {stats.chordQualities.length === 0 ? (
                    <Muted>Chord colours show up once you have repeating progressions.</Muted>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Chord qualities by use">
                      {stats.chordQualities.map((q) => (
                        <li
                          key={q.quality}
                          data-testid="stats-quality"
                          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-zinc-900 px-3 text-sm text-zinc-200 ring-1 ring-zinc-800"
                        >
                          {qualityName(q.quality)}
                          <span className="text-xs text-zinc-500 tabular-nums">{q.count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {stats.leastPlayedKeys.length > 0 && (
              <section
                aria-labelledby="stats-nudge"
                className="rounded-2xl bg-violet-400/5 p-4 ring-1 ring-violet-400/20"
              >
                <h2 id="stats-nudge" className="mb-1 text-base font-semibold text-violet-100">
                  Try jamming in…
                </h2>
                <p className="mb-3 text-sm text-zinc-400">
                  Keys you have spent under five minutes in, closest to your usual ones first.
                </p>
                <ul className="flex flex-wrap gap-2">
                  {stats.leastPlayedKeys.slice(0, NUDGES).map((k) => {
                    const name = pretty(keyName(k, { spellingFollowsKey }));
                    return (
                      <li key={`${k.tonic}:${k.mode}`}>
                        <Link
                          to={jamInKeyHref(k)}
                          aria-label={`Jam in ${name}`}
                          className="inline-flex min-h-11 items-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white ring-1 ring-zinc-800 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-violet-300"
                        >
                          {name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  spoken,
  accent = false,
}: {
  label: string;
  value: string;
  spoken?: string;
  accent?: boolean;
}) {
  return (
    <div data-testid="stats-tile" className="rounded-2xl bg-zinc-900/50 p-4 ring-1 ring-zinc-800">
      <dt className="text-xs font-medium tracking-widest text-zinc-500 uppercase">{label}</dt>
      <dd
        aria-label={spoken}
        className={cx(
          'mt-1 text-3xl font-semibold tabular-nums',
          accent ? 'text-violet-200' : 'text-white',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = `stats-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900">
      <h2 id={id} className="mb-3 text-xs font-medium tracking-widest text-zinc-500 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>;
}

function KeyList({ stats, spellingFollowsKey }: { stats: Stats; spellingFollowsKey: boolean }) {
  const max = Math.max(1, ...stats.keys.map((k) => k.seconds));
  const total = Math.max(
    1,
    stats.keys.reduce((n, k) => n + k.seconds, 0),
  );
  return (
    <ul className="flex flex-col gap-2.5">
      {stats.keys.map((k) => {
        const name = pretty(keyName(k.key, { spellingFollowsKey }));
        const pct = Math.round((k.seconds / total) * 100);
        return (
          <li key={`${k.key.tonic}:${k.key.mode}`} data-testid="stats-key">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-white">{name}</span>
              <span className="text-zinc-400 tabular-nums">
                {durationLabel(k.seconds)} · {pct}%
              </span>
            </div>
            <div
              role="meter"
              aria-label={`${name}: ${durationSpoken(k.seconds)}, ${pct}% of key time, ${k.sessions} session${k.sessions === 1 ? '' : 's'}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800"
            >
              <div
                className="h-full rounded-full bg-violet-400"
                style={{ width: `${(k.seconds / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
