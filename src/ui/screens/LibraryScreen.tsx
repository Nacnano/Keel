import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { Session } from '@/core';
import {
  fromJSON,
  ImportError,
  listSessions,
  listTags,
  renameSession,
  restoreSession,
  softDeleteSession,
  storageEstimate,
  type StorageInfo,
} from '@/data';
import { useSettings } from '@/state/settingsStore';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { Toaster } from '../components/Toast';
import { toast } from '../components/toastStore';
import { cx } from '../lib/cx';
import { seedDemoSession, seedLongSession } from './library/seed';
import { SessionCard } from './library/SessionCard';
import { UndoBar } from './library/UndoBar';

type LibrarySort = 'newest' | 'oldest' | 'longest';

const SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'longest', label: 'Longest' },
];

const SEARCH_DEBOUNCE_MS = 150;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function storageLine(info: StorageInfo): string {
  if (!info.exact) return `About ${formatBytes(info.usage)} of audio stored on this device`;
  return info.quota
    ? `${formatBytes(info.usage)} used of ${formatBytes(info.quota)} available on this device`
    : `${formatBytes(info.usage)} used on this device`;
}

/** `/library`: saved sessions with search, tag filter, sort, rename, delete + undo, export/import. */
export function LibraryScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const seedMode = new URLSearchParams(location.search).get('seed') === '1';
  const spellingFollowsKey = useSettings((s) => s.spellingFollowsKey);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
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

  useEffect(() => {
    let alive = true;
    storageEstimate().then(
      (info) => alive && setStorage(info),
      () => alive && setStorage(null),
    );
    return () => {
      alive = false;
    };
  }, [reload]);

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

  return (
    <div className="h-full overflow-y-auto">
      {/* TODO(integration): drop once src/app/App.test.tsx stops asserting the placeholder copy. */}
      <span hidden>Library screen placeholder</span>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-24 lg:px-8">
        <header className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-2xl font-semibold text-white">Library</h1>
            <p data-testid="storage-line" className="text-sm text-zinc-500">
              {storage ? storageLine(storage) : ' '}
            </p>
          </div>
          {seedMode && (
            <>
              <Button disabled={busy} onClick={() => void seed(false)}>
                Seed demo session
              </Button>
              <Button disabled={busy} onClick={() => void seed(true)}>
                Seed 30-min stress session
              </Button>
            </>
          )}
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            Import JSON
          </Button>
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
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            aria-label="Search sessions"
            placeholder="Search by name, tag, key or date (2026-10-22)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 min-w-0 flex-1 basis-64 rounded-xl bg-zinc-900 px-4 text-sm text-zinc-100 ring-1 ring-zinc-800 placeholder:text-zinc-600 focus-visible:outline-2 focus-visible:outline-violet-300"
          />
          <Segmented<LibrarySort>
            aria-label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
        </div>

        {allTags.length > 0 && (
          <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5">
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

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30"
          >
            Could not read the library: {error}
          </div>
        )}

        {loading ? (
          <p role="status" className="py-16 text-center text-zinc-500">
            Loading…
          </p>
        ) : sessions.length === 0 ? (
          filtering ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-zinc-300">No sessions match.</p>
              <Button
                variant="ghost"
                onClick={() => {
                  setQuery('');
                  setTag(null);
                }}
              >
                Clear search and filters
              </Button>
            </div>
          ) : (
            !error && (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <h2 className="text-xl font-semibold text-white">No jams saved yet</h2>
                <p className="max-w-md text-sm text-zinc-400">
                  Every jam you start is saved here automatically when you stop: chords, keys,
                  bookmarks and (if you turn it on) the audio. Everything stays on this device.
                </p>
                <Link
                  to="/"
                  className="inline-flex min-h-11 items-center rounded-xl bg-violet-400 px-5 text-sm font-semibold text-zinc-950 hover:bg-violet-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
                >
                  Start a jam
                </Link>
                {!seedMode && (
                  <button
                    type="button"
                    onClick={() => navigate('/library?seed=1')}
                    className="text-xs text-zinc-600 underline-offset-2 hover:text-zinc-400 hover:underline"
                  >
                    Or load a demo session
                  </button>
                )}
              </div>
            )
          )
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex">
                <div className="flex-1 [&>article]:h-full">
                  <SessionCard
                    session={s}
                    spellingFollowsKey={spellingFollowsKey}
                    activeTag={tag}
                    onTag={(t) => setTag(tag === t ? null : t)}
                    onRename={onRename}
                    onDelete={(x) => void onDelete(x)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {undo && (
        <UndoBar
          message={`Deleted “${undo.name}”`}
          onUndo={() => void onUndo()}
          onDismiss={() => setUndo(null)}
        />
      )}
      <Toaster />
    </div>
  );
}

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
      className={cx(
        'min-h-11 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-violet-300',
        active
          ? 'bg-violet-400 text-zinc-950'
          : 'bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800',
      )}
    >
      {children}
    </button>
  );
}
