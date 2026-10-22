import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatTime, fromJSON } from '@/data/export';
import { isSyncConfigured } from '@/sync/client';
import { fetchShare, type SharedChart } from '@/sync/share';
import { chordSymbol, keyName, prettyAccidentals, romanNumeral } from '@/theory';
import { Button } from '../components/Button';
import { buildShareChart, type ChartSegment } from './share/chart';

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

function Segment({ segment }: { segment: ChartSegment }) {
  return (
    <li className="flex items-end gap-2">
      <span aria-hidden className="pb-5 text-zinc-600">
        |
      </span>
      {segment.items.map((c, i) => (
        <span key={i} className="flex min-w-10 flex-col items-center">
          <span className="text-lg font-semibold text-white">
            {prettyAccidentals(chordSymbol(c.chord, c.key))}
          </span>
          <span className="text-xs text-violet-300" data-testid="numeral">
            {c.key ? prettyAccidentals(romanNumeral(c.chord, c.key)) : ' '}
          </span>
        </span>
      ))}
      <span aria-hidden className="pb-5 text-zinc-600">
        |
      </span>
      {segment.repeat > 1 && (
        <span className="pb-5 text-sm font-medium text-zinc-400">×{segment.repeat}</span>
      )}
    </li>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-[max(env(safe-area-inset-bottom),24px)]">
        <div className="flex items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight text-violet-300">
            JamKey
          </Link>
          <span className="text-xs tracking-widest text-zinc-500 uppercase">Shared chart</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Public, read-only chart at `/s/:code`. Works logged out. */
export function ShareScreen() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>(() =>
    isSyncConfigured() ? { kind: 'loading' } : { kind: 'unconfigured' },
  );
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSyncConfigured()) return setState({ kind: 'unconfigured' });
    setState({ kind: 'loading' });
    try {
      const share = await fetchShare(code);
      setState(share ? { kind: 'ready', share } : { kind: 'not-found' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = useMemo(
    () => (state.kind === 'ready' ? buildShareChart(state.share.payload.chart) : null),
    [state],
  );

  if (state.kind === 'loading') {
    return (
      <Frame>
        <p role="status" className="text-sm text-zinc-500">
          Loading chart…
        </p>
      </Frame>
    );
  }
  if (state.kind !== 'ready' || !model) {
    const [title, body] =
      state.kind === 'unconfigured'
        ? ['Sharing is not available', 'This copy of JamKey is not connected to a sync server.']
        : state.kind === 'not-found'
          ? ['Chart not found', 'The link may be mistyped, or its owner revoked it.']
          : ['Could not load the chart', state.kind === 'error' ? state.message : ''];
    return (
      <Frame>
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-zinc-900/40 p-6 ring-1 ring-zinc-900">
          <h1 className="text-xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-zinc-400">{body}</p>
          <div className="flex gap-2">
            {state.kind === 'error' && <Button onClick={() => void load()}>Try again</Button>}
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm text-violet-300 hover:bg-zinc-800/70"
            >
              Open JamKey
            </Link>
          </div>
        </div>
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
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words text-white lg:text-3xl">
            {session.name}
          </h1>
          <p className="flex flex-wrap gap-x-3 text-sm text-zinc-400">
            <span>{fmtDate(session.createdAt)}</span>
            <span aria-label="Duration">{formatTime(session.durationSec)}</span>
          </p>
          {model.keys.length > 0 && (
            <p data-testid="share-keys" className="text-sm text-violet-200">
              {model.keys.map((k) => prettyAccidentals(keyName(k.key))).join(' → ')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void copyChart()}>Copy chart</Button>
          <Button variant="primary" disabled={importing} onClick={() => void openInJamKey()}>
            Open in JamKey
          </Button>
        </div>
      </header>

      {notice && (
        <p role="status" className="text-sm text-zinc-300">
          {notice}
        </p>
      )}

      {model.sections.length === 0 ? (
        <p className="text-sm text-zinc-500">This chart has no chords.</p>
      ) : (
        <ol aria-label="Chord chart" className="flex flex-col gap-5">
          {model.sections.map((s, i) => (
            <li key={i} className="flex flex-col gap-2">
              {s.label && (
                <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">
                  {s.label} <span className="font-normal">· {formatTime(s.t)}</span>
                </h2>
              )}
              <ul className="flex flex-wrap gap-x-4 gap-y-3">
                {s.segments.map((seg, j) => (
                  <Segment key={j} segment={seg} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {model.bookmarks.length > 0 && (
        <section aria-label="Bookmarks" className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">
            Bookmarks
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm text-zinc-300">
            {model.bookmarks.map((m) => (
              <li key={m.id} className="rounded-lg bg-zinc-900 px-2.5 py-1 ring-1 ring-zinc-800">
                {formatTime(m.t)}
                {m.label ? ` ${m.label}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-zinc-600">
        Shared {fmtDate(state.share.createdAt)} · read-only snapshot
      </p>
    </Frame>
  );
}
