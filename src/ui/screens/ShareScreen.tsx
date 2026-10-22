import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AudioLines, CloudOff, Copy, FileQuestion, TriangleAlert } from 'lucide-react';
import { formatTime, fromJSON } from '@/data/export';
import { isSyncConfigured } from '@/sync/client';
import { fetchShare, type SharedChart } from '@/sync/share';
import { chordSymbol, keyName, prettyAccidentals, romanNumeral } from '@/theory';
import { Button, Group } from '../kit';
import { cx } from '../lib/cx';
import { FILLED_LINK, GRAY_LINK } from './library/linkStyles';
import { buildShareChart, type ChartSegment } from './share/chart';
import { PageState } from './share/PageState';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'unconfigured' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; share: SharedChart };

function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** One run of chords; repeats are bracketed with a count, like the jam timeline. */
function Segment({ segment }: { segment: ChartSegment }) {
  const repeated = segment.repeat > 1;
  return (
    <li className={cx('flex items-center', repeated && 'rounded-cell bg-fill-4 pr-2.5')}>
      {repeated && (
        <span aria-hidden className="pl-1.5 text-title-2 text-label-4">
          [
        </span>
      )}
      {segment.items.map((c, i) => (
        <span key={i} className="flex min-w-12 flex-col items-center px-1.5 py-1.5">
          <span className="text-title-3 font-semibold text-label">
            {prettyAccidentals(chordSymbol(c.chord, c.key))}
          </span>
          <span
            className="h-4 text-caption leading-4 font-medium text-accent"
            data-testid="numeral"
          >
            {c.key ? prettyAccidentals(romanNumeral(c.chord, c.key)) : ' '}
          </span>
        </span>
      ))}
      {repeated && (
        <>
          <span aria-hidden className="text-title-2 text-label-4">
            ]
          </span>
          <span className="ml-1 text-callout font-semibold text-accent tabular">
            ×{segment.repeat}
          </span>
        </>
      )}
    </li>
  );
}

/** Standalone page (no app chrome): small wordmark, then a centred reading column. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-bg text-label">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-6 pb-[max(env(safe-area-inset-bottom),40px)]">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-[8px] text-subhead font-semibold tracking-tight text-label"
          >
            <span className="flex size-6 items-center justify-center rounded-[7px] bg-accent text-accent-fg">
              <AudioLines className="size-3.5" aria-hidden />
            </span>
            JamKey
          </Link>
          <span className="text-caption font-medium tracking-wide text-label-3 uppercase">
            Shared chart
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Public, read-only chart at `/s/:code`. Works logged out. */
export function ShareScreen() {
  const { code = '' } = useParams();
  // Keyed so a new code starts from a clean loading state.
  return <SharedChartView key={code} code={code} />;
}

function SharedChartView({ code }: { code: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>(() =>
    isSyncConfigured() ? { kind: 'loading' } : { kind: 'unconfigured' },
  );
  const [attempt, setAttempt] = useState(0);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isSyncConfigured()) return;
    let cancelled = false;
    fetchShare(code).then(
      (share) => {
        if (!cancelled) setState(share ? { kind: 'ready', share } : { kind: 'not-found' });
      },
      (err: unknown) => {
        if (!cancelled) {
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((a) => a + 1);
  };

  const model = useMemo(
    () => (state.kind === 'ready' ? buildShareChart(state.share.payload.chart) : null),
    [state],
  );

  if (state.kind === 'loading') {
    return (
      <Frame>
        <PageState
          status
          icon={
            <span
              aria-hidden
              className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          }
          title="Loading chart…"
        />
      </Frame>
    );
  }
  if (state.kind !== 'ready' || !model) {
    const [title, body, icon] =
      state.kind === 'unconfigured'
        ? [
            'Sharing is not available',
            'This copy of JamKey is not connected to a sync server.',
            <CloudOff key="i" aria-hidden />,
          ]
        : state.kind === 'not-found'
          ? [
              'Chart not found',
              'The link may be mistyped, or its owner revoked it.',
              <FileQuestion key="i" aria-hidden />,
            ]
          : [
              'Could not load the chart',
              state.kind === 'error' ? state.message : '',
              <TriangleAlert key="i" aria-hidden />,
            ];
    return (
      <Frame>
        <PageState
          icon={icon}
          title={title}
          description={body}
          action={
            <>
              {state.kind === 'error' && (
                <Button variant="filled" round onClick={retry}>
                  Try again
                </Button>
              )}
              <Link to="/" className={state.kind === 'error' ? GRAY_LINK : FILLED_LINK}>
                Open JamKey
              </Link>
            </>
          }
        />
      </Frame>
    );
  }

  const { payload } = state.share;
  const { session } = payload.chart;

  const openInJamKey = async () => {
    setImporting(true);
    try {
      const id = await fromJSON(payload.chart);
      void navigate(`/review/${id}`);
    } catch (err) {
      setNotice(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setImporting(false);
    }
  };

  const copyChart = async () => {
    try {
      await navigator.clipboard.writeText(payload.text);
      setNotice('Chord chart copied');
    } catch {
      setNotice('Copy is not available in this browser');
    }
  };

  return (
    <Frame>
      <header className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-large-title font-bold break-words text-label">{session.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-subhead text-label-2">
            {model.keys.length > 0 && (
              <>
                <span data-testid="share-keys" className="font-semibold text-label">
                  {model.keys.map((k) => prettyAccidentals(keyName(k.key))).join(' → ')}
                </span>
                <span aria-hidden className="text-label-4">
                  ·
                </span>
              </>
            )}
            <span aria-label="Duration" className="tabular">
              {formatTime(session.durationSec)}
            </span>
            <span aria-hidden className="text-label-4">
              ·
            </span>
            <span>{fmtDate(session.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="filled"
            round
            size="lg"
            loading={importing}
            onClick={() => void openInJamKey()}
          >
            Open in JamKey
          </Button>
          <Button
            variant="gray"
            round
            size="lg"
            leading={<Copy className="size-4" aria-hidden />}
            onClick={() => void copyChart()}
          >
            Copy chart
          </Button>
        </div>
        {notice && (
          <p role="status" className="anim-fade-in text-subhead text-label-2">
            {notice}
          </p>
        )}
      </header>

      {model.sections.length === 0 ? (
        <p className="rounded-card bg-surface px-4 py-6 text-center text-subhead text-label-2">
          This chart has no chords.
        </p>
      ) : (
        <ol aria-label="Chord chart" className="flex flex-col gap-6">
          {model.sections.map((s, i) => (
            <li key={i} className="flex flex-col gap-2">
              {s.label && (
                <h2 className="flex items-baseline gap-2 px-1 text-headline text-warn">
                  <span className="capitalize">{s.label}</span>
                  <span className="text-footnote font-normal text-label-3 tabular">
                    {formatTime(s.t)}
                  </span>
                </h2>
              )}
              <ul className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-card bg-surface px-2 py-2">
                {s.segments.length === 0 ? (
                  <li className="px-2 py-3 text-subhead text-label-3">
                    No chords in this section.
                  </li>
                ) : (
                  s.segments.map((seg, j) => <Segment key={j} segment={seg} />)
                )}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {model.bookmarks.length > 0 && (
        <Group title="Bookmarks" aria-label="Bookmarks">
          {model.bookmarks.map((m) => (
            <div key={m.id} className="flex min-h-11 items-center gap-3 px-4 py-2 text-body">
              <span className="w-12 text-subhead text-label-2 tabular">{formatTime(m.t)}</span>{' '}
              <span className="text-label">{m.label ?? 'Bookmark'}</span>
            </div>
          ))}
        </Group>
      )}

      <p className="text-center text-caption text-label-3">
        Shared {fmtDate(state.share.createdAt)} · read-only snapshot
      </p>
    </Frame>
  );
}
