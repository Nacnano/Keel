import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BarChart3 } from 'lucide-react';
import { loadStats, type Stats, type StatsRange } from '@/data';
import { chordSymbol, keyName, prettyAccidentals as pretty, romanNumeral } from '@/theory';
import { useSettings } from '@/state/settingsStore';
import { Badge, Button, EmptyState, Group, PageHeader, Row, Segmented } from '../kit';
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
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
      <div className="mx-auto max-w-2xl pb-[max(env(safe-area-inset-bottom),32px)]">
        <PageHeader
          title="Stats"
          actions={
            !nothingSaved && (
              <Segmented<StatsRange>
                size="sm"
                aria-label="Time range"
                options={RANGE_OPTIONS}
                value={range}
                onChange={setRange}
              />
            )
          }
        />

        <div className="flex flex-col gap-6 px-4 pt-2">
          {error && (
            <div role="alert" className="rounded-cell bg-live/12 px-4 py-3 text-subhead text-live">
              Could not read your sessions: {error}
            </div>
          )}

          {stats === null ? (
            !error && (
              <p role="status" className="py-16 text-center text-subhead text-label-2">
                Loading…
              </p>
            )
          ) : nothingSaved ? (
            <EmptyState
              icon={<BarChart3 aria-hidden />}
              title="No jams to count yet"
              description="Save a few jams and this page shows how long you play, your streaks, the keys you lean on and the progressions you come back to."
              action={
                <Link
                  to="/"
                  className="inline-flex h-11 items-center rounded-control bg-accent px-5 text-subhead font-semibold text-accent-fg transition-[filter] hover:brightness-110"
                >
                  Start a jam
                </Link>
              }
            />
          ) : (
            <>
              <Group footer="Worked out on this device from your saved jams.">
                <SummaryRow
                  label="Time played"
                  value={durationLabel(stats.totalSeconds)}
                  spoken={durationSpoken(stats.totalSeconds)}
                />
                <SummaryRow label="Sessions" value={String(stats.sessionCount)} />
                <SummaryRow
                  label="Current streak"
                  value={days(stats.streak.current)}
                  accent={stats.streak.current > 0}
                />
                <SummaryRow label="Longest streak" value={days(stats.streak.longest)} />
              </Group>

              {emptyRange ? (
                <EmptyState
                  className="py-10"
                  title={`No jams ${RANGE_TEXT[range]}.`}
                  action={
                    <Button variant="gray" onClick={() => setRange('all')}>
                      Show all time
                    </Button>
                  }
                />
              ) : (
                <>
                  <Group title="Time per day" flush>
                    <div className="px-4 pt-4 pb-3">
                      <DayStrip days={stats.perDay} />
                    </div>
                  </Group>

                  <Group title="Keys you play">
                    {stats.keys.length === 0 ? (
                      <Muted>No keys detected yet.</Muted>
                    ) : (
                      <KeyRows stats={stats} spellingFollowsKey={spellingFollowsKey} />
                    )}
                  </Group>

                  <Group title="Top progressions">
                    {stats.progressions.length === 0 ? (
                      <Muted>
                        No repeating progressions yet. Loop a few chords and they show here.
                      </Muted>
                    ) : (
                      stats.progressions.slice(0, TOP_PROGRESSIONS).map((p, i) => (
                        <div
                          key={i}
                          data-testid="stats-progression"
                          className="flex min-h-11 items-center gap-3 px-4 py-2.5"
                        >
                          <span className="flex min-w-0 flex-1 flex-wrap gap-x-3.5 gap-y-1">
                            {p.chords.map((c, j) => (
                              <span key={j} className="flex flex-col items-center leading-tight">
                                <span className="text-body font-semibold text-label">
                                  {pretty(chordSymbol(c, p.key, { spellingFollowsKey, showSlash }))}
                                </span>
                                <span className="text-caption font-medium text-accent">
                                  {p.key ? pretty(romanNumeral(c, p.key)) : ''}
                                </span>
                              </span>
                            ))}
                          </span>
                          <span className="shrink-0 text-right leading-tight">
                            <span className="block text-body text-label-2 tabular">×{p.count}</span>
                            <span className="block text-caption text-label-3">
                              {plural(p.sessions, 'session')}
                              {p.key && ` · ${pretty(keyName(p.key, { spellingFollowsKey }))}`}
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </Group>

                  <Group title="Chord qualities" flush>
                    {stats.chordQualities.length === 0 ? (
                      <Muted>Chord colours show up once you have repeating progressions.</Muted>
                    ) : (
                      <ul
                        className="flex flex-wrap gap-1.5 px-4 py-3"
                        aria-label="Chord qualities by use"
                      >
                        {stats.chordQualities.map((q) => (
                          <li key={q.quality} data-testid="stats-quality">
                            <Badge className="h-7 gap-1.5 px-3 text-footnote">
                              {qualityName(q.quality)}
                              <span className="font-medium text-label-3 tabular">{q.count}</span>
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Group>
                </>
              )}

              {stats.leastPlayedKeys.length > 0 && (
                <Group
                  title="Try jamming in…"
                  aria-label="Try jamming in…"
                  footer="Keys you have spent under five minutes in, closest to your usual ones first."
                >
                  {stats.leastPlayedKeys.slice(0, NUDGES).map((k) => {
                    const name = pretty(keyName(k, { spellingFollowsKey }));
                    return (
                      <Link
                        key={`${k.tonic}:${k.mode}`}
                        to={jamInKeyHref(k)}
                        aria-label={`Jam in ${name}`}
                        className="block transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
                      >
                        <Row label={name} chevron />
                      </Link>
                    );
                  })}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
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
    <Row
      data-testid="stats-tile"
      label={label}
      accessory={
        <span aria-label={spoken} className={cx('tabular', accent && 'font-semibold text-accent')}>
          {value}
        </span>
      }
    />
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-subhead text-label-2">{children}</p>;
}

function KeyRows({ stats, spellingFollowsKey }: { stats: Stats; spellingFollowsKey: boolean }) {
  const max = Math.max(1, ...stats.keys.map((k) => k.seconds));
  const total = Math.max(
    1,
    stats.keys.reduce((n, k) => n + k.seconds, 0),
  );
  return stats.keys.map((k) => {
    const name = pretty(keyName(k.key, { spellingFollowsKey }));
    const pct = Math.round((k.seconds / total) * 100);
    return (
      <Row
        key={`${k.key.tonic}:${k.key.mode}`}
        data-testid="stats-key"
        stacked
        label={
          <span className="flex items-baseline justify-between gap-3">
            <span>{name}</span>
            <span className="text-subhead text-label-2 tabular">
              {durationLabel(k.seconds)} · {pct}%
            </span>
          </span>
        }
        accessory={
          <div
            role="meter"
            aria-label={`${name}: ${durationSpoken(k.seconds)}, ${pct}% of key time, ${plural(k.sessions, 'session')}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1 overflow-hidden rounded-full bg-fill-3"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${(k.seconds / max) * 100}%` }}
            />
          </div>
        }
      />
    );
  });
}
