import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AudioLines, CloudOff, Copy, FileQuestion, TriangleAlert } from 'lucide-react';
import { buildChart, formatTime, fromJSON } from '@/data/export';
import { isSyncConfigured } from '@/sync/client';
import { fetchShare, type SharedChart } from '@/sync/share';
import { keyName, prettyAccidentals } from '@/theory';
import { ChordChart } from '../components/ChordChart';
import { Button, Group, Page } from '../kit';
import { FILLED_LINK, GRAY_LINK } from './library/linkStyles';
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

const WORDMARK = (
  <Link
    to="/"
    className="flex h-11 items-center gap-2 rounded-[8px] px-2 text-subhead font-semibold tracking-tight text-label"
  >
    <span className="flex size-6 items-center justify-center rounded-[7px] bg-action text-accent-fg">
      <AudioLines className="size-3.5" aria-hidden />
    </span>
    Keel
  </Link>
);

const SHARED_LABEL = (
  <span className="px-2 text-caption font-medium tracking-wide text-label-3 uppercase">
    Shared chart
  </span>
);

/** Loading and error states: the wordmark row, then a centred message. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-bg text-label">
      <div className="mx-auto flex max-w-3xl flex-col">
        <div className="flex h-13 items-center justify-between gap-2 px-2">
          {WORDMARK}
          {SHARED_LABEL}
        </div>
        <div className="px-4">{children}</div>
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
    () =>
      state.kind === 'ready'
        ? buildChart({
            ...state.share.payload.chart,
            durationSec: state.share.payload.chart.session.durationSec,
          })
        : null,
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
            'This copy of Keel is not connected to a sync server.',
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
                Open Keel
              </Link>
            </>
          }
        />
      </Frame>
    );
  }

  const { payload } = state.share;
  const { session } = payload.chart;

  const openInKeel = async () => {
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
    <div className="h-full bg-bg text-label">
      <Page
        leading={WORDMARK}
        actions={SHARED_LABEL}
        title={session.name}
        subtitle={
          <p className="flex flex-wrap items-center gap-x-2">
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
        }
      >
        <div className="flex flex-col gap-6 px-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="filled"
                round
                size="lg"
                loading={importing}
                onClick={() => void openInKeel()}
              >
                Open in Keel
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
          </div>

          {model.parts.length === 0 ? (
            <p className="rounded-card bg-surface px-4 py-6 text-center text-subhead text-label-2">
              This chart has no chords.
            </p>
          ) : (
            <ChordChart
              chart={model}
              spellingFollowsKey
              showSlash
              className="rounded-card bg-surface px-4 py-3"
            />
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
        </div>
      </Page>
    </div>
  );
}
