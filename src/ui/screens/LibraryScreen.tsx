import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ChartColumn, LibraryBig, Search, SearchX, Upload } from 'lucide-react';
import type { Session } from '@/core';
import {
  fromJSON,
  ImportError,
  listSessions,
  listTags,
  renameSession,
  restoreSession,
  softDeleteSession,
} from '@/data';
import { useSettings } from '@/state/settingsStore';
import { useSync } from '@/sync/store';
import { Button, EmptyState, Group, PageHeader, Segmented } from '../kit';
import { SyncPill } from '../components/SyncPill';
import { toast } from '../components/toastStore';
import { cx } from '../lib/cx';
import { seedDemoSession, seedLongSession } from './library/seed';
import { SessionRow } from './library/SessionRow';
import { UndoBar } from './library/UndoBar';
import { FILLED_LINK, PLAIN_LINK } from './library/linkStyles';
import { ShareDialog } from './review/ShareDialog';

type LibrarySort = 'newest' | 'oldest' | 'longest';

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'longest', label: 'Longest' },
];

const SEARCH_DEBOUNCE_MS = 150;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `/library`: saved sessions with search, tag filter, sort, rename, delete + undo, export/import. */
export function LibraryScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const seedMode = new URLSearchParams(location.search).get('seed') === '1';
  const spellingFollowsKey = useSettings((s) => s.spellingFollowsKey);
  const syncConfigured = useSync((s) => s.configured);
  const signedIn = useSync((s) => s.user !== null);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    Promise.all([listSessions({ query: debounced, tag: tag ?? undefined, sort }), listTags()]).then(
      ([rows, tags]) => {
        if (!alive) return;
        setSessions(rows);
        setAllTags(tags);
        setError(null);
        // A filter tag that no longer exists (last session with it deleted) is dropped.
        if (tag && !tags.includes(tag)) setTag(null);
      },
      (err: unknown) => {
        if (!alive) return;
        setSessions([]);
        setError(errorText(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [debounced, tag, sort, reload]);

  const onRename = async (id: string, name: string) => {
    try {
      await renameSession(id, name);
      refresh();
    } catch (err) {
      toast(`Could not rename: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const onDelete = async (s: Session) => {
    try {
      await softDeleteSession(s.id);
      setUndo({ id: s.id, name: s.name });
      refresh();
    } catch (err) {
      toast(`Could not delete: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const onUndo = async () => {
    const u = undo;
    setUndo(null);
    if (!u) return;
    try {
      await restoreSession(u.id);
      toast(`Restored “${u.name}”`, { tone: 'success', durationMs: 1800 });
      refresh();
    } catch (err) {
      toast(`Could not restore: ${errorText(err)}`, { tone: 'error' });
    }
  };

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const id = await fromJSON(await file.text());
      toast('Session imported', { tone: 'success' });
      refresh();
      return id;
    } catch (err) {
      const msg =
        err instanceof ImportError
          ? err.message
          : err instanceof SyntaxError
            ? 'Import failed: the file is not valid JSON.'
            : `Import failed: ${errorText(err)}`;
      toast(msg, { tone: 'error', durationMs: 5000 });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const seed = async (long: boolean) => {
    setBusy(true);
    try {
      const id = await (long ? seedLongSession() : seedDemoSession());
      toast('Demo session added', { tone: 'success' });
      refresh();
      return id;
    } catch (err) {
      toast(`Seeding failed: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const filtering = debounced.trim() !== '' || tag !== null;
  const loading = sessions === null;
  const firstRun = !loading && sessions.length === 0 && !filtering && !error;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-28 lg:px-4 lg:pb-12">
        <PageHeader
          title="Library"
          subtitle={syncConfigured ? <SyncPill /> : undefined}
          actions={
            <>
              <Button
                variant="gray"
                disabled={busy}
                leading={<Upload className="size-4" aria-hidden />}
                onClick={() => fileInput.current?.click()}
              >
                Import
              </Button>
              <Link to="/stats" className={PLAIN_LINK}>
                <ChartColumn className="size-[18px]" aria-hidden />
                Stats
              </Link>
            </>
          }
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          aria-label="Import session JSON file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
          }}
        />

        {!firstRun && (
          <div className="flex flex-col gap-3 px-4 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative flex min-w-0 flex-1 basis-60 items-center">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 size-4 text-label-2"
                />
                <input
                  type="search"
                  aria-label="Search sessions"
                  placeholder="Search name, tag, key or date"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9 w-full min-w-0 rounded-control bg-fill-3 pr-3 pl-8 text-body text-label placeholder:text-label-3"
                />
              </label>
              <Segmented<LibrarySort>
                size="sm"
                aria-label="Sort"
                options={SORT_OPTIONS}
                value={sort}
                onChange={setSort}
              />
            </div>

            {allTags.length > 0 && (
              <div
                role="group"
                aria-label="Filter by tag"
                className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]"
              >
                <TagChip active={tag === null} onClick={() => setTag(null)}>
                  All
                </TagChip>
                {allTags.map((t) => (
                  <TagChip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </TagChip>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mx-4 mb-4 rounded-cell bg-live/12 px-4 py-3 text-subhead text-live"
          >
            Could not read the library: {error}
          </div>
        )}

        {loading ? (
          <p role="status" className="py-16 text-center text-subhead text-label-3">
            Loading…
          </p>
        ) : sessions.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={<SearchX aria-hidden />}
              title="No sessions match."
              description="Try another name, key or date, or clear the tag filter."
              action={
                <Button
                  variant="plain"
                  onClick={() => {
                    setQuery('');
                    setTag(null);
                  }}
                >
                  Clear search and filters
                </Button>
              }
            />
          ) : (
            !error && (
              <EmptyState
                icon={<LibraryBig aria-hidden />}
                title="Your jams, ready to revisit"
                description="Finish a jam to see it here."
                action={
                  <div className="flex flex-col items-center gap-2">
                    <Link to="/" className={FILLED_LINK}>
                      Start listening
                    </Link>
                    {!seedMode && (
                      <button
                        type="button"
                        onClick={() => void navigate('/library?seed=1')}
                        className="min-h-11 px-3 text-footnote text-label-3 transition-colors hover:text-label-2"
                      >
                        Or load a demo session
                      </button>
                    )}
                  </div>
                }
              />
            )
          )
        ) : (
          <Group flush className="px-4" aria-label="Sessions">
            <ul className="[&>li+li]:hairline-t">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  spellingFollowsKey={spellingFollowsKey}
                  onRename={onRename}
                  onDelete={(x) => void onDelete(x)}
                  onShareLink={
                    syncConfigured
                      ? (x) =>
                          signedIn
                            ? setSharing(x.id)
                            : toast('Sign in under Settings → Account & sync to share a link.', {
                                durationMs: 3500,
                              })
                      : undefined
                  }
                />
              ))}
            </ul>
          </Group>
        )}

        {seedMode && (
          <div
            role="group"
            aria-label="Developer tools"
            className="mt-8 flex flex-wrap items-center justify-center gap-x-1 px-4 text-footnote text-label-3"
          >
            <span>Developer:</span>
            <SeedButton disabled={busy} onClick={() => void seed(false)}>
              Seed demo session
            </SeedButton>
            <span aria-hidden>·</span>
            <SeedButton disabled={busy} onClick={() => void seed(true)}>
              Seed 30-min stress session
            </SeedButton>
          </div>
        )}
      </div>

      {undo && (
        <UndoBar
          message={`Deleted “${undo.name}”`}
          onUndo={() => void onUndo()}
          onDismiss={() => setUndo(null)}
        />
      )}
      {sharing && <ShareDialog open onClose={() => setSharing(null)} sessionId={sharing} />}
    </div>
  );
}

function SeedButton(props: { disabled: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="min-h-11 rounded-[8px] px-2 text-accent transition-colors hover:bg-fill-4 disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

/** Small filter toggle; the visible chip is compact, the hit area is 44 px tall. */
function TagChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group flex min-h-11 shrink-0 items-center focus-visible:outline-none"
    >
      <span
        className={cx(
          'inline-flex h-7 items-center rounded-full px-3 text-footnote font-semibold whitespace-nowrap transition-colors duration-150',
          'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent',
          active ? 'bg-action text-accent-fg' : 'bg-fill-3 text-label-2 hover:bg-fill-2',
        )}
      >
        {children}
      </span>
    </button>
  );
}
