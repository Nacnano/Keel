import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { signInWithGoogle, signOut } from '@/sync/auth';
import { syncNow } from '@/sync/engine';
import { useSync } from '@/sync/store';
import { Button } from '../../components/Button';
import { formatAgo, syncLabel, useNow } from '../../lib/syncLabel';
import { toast } from '../../components/toastStore';

export const SUPABASE_SETUP_URL = 'https://github.com/Nacnano/music/blob/main/supabase/README.md';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Body of Settings → "Account & sync". */
export function AccountSync() {
  const s = useSync(
    useShallow((st) => ({
      configured: st.configured,
      user: st.user,
      status: st.status,
      lastSyncAt: st.lastSyncAt,
      error: st.error,
      online: st.online,
    })),
  );
  const now = useNow();
  const [busy, setBusy] = useState(false);

  if (!s.configured) {
    return (
      <div data-testid="sync-unconfigured" className="flex flex-col gap-2 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Sync is not configured</p>
        <p>
          Your sessions are saved on this device only. Cloud sync, Google sign-in and share links
          need a Supabase project; the setup steps are in{' '}
          <a
            href={SUPABASE_SETUP_URL}
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 underline underline-offset-2 hover:text-violet-200"
          >
            supabase/README.md
          </a>
          .
        </p>
      </div>
    );
  }

  if (!s.user) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-sm text-zinc-400">
          Sign in to back up your chord charts and open them on other devices. Audio recordings stay
          on this device.
        </p>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signInWithGoogle(); // redirects away on success
            } catch (err) {
              toast(`Sign-in failed: ${errMsg(err)}`, { tone: 'error' });
              setBusy(false);
            }
          }}
        >
          Sign in with Google
        </Button>
      </div>
    );
  }

  const label = syncLabel(s, now);
  const statusText =
    s.status === 'error'
      ? `Sync failed: ${s.error ?? 'unknown error'}`
      : !s.online
        ? 'Offline. Changes sync when you are back online.'
        : s.status === 'syncing'
          ? 'Syncing…'
          : s.lastSyncAt
            ? `Last synced ${formatAgo(s.lastSyncAt, now)}`
            : 'Not synced yet';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-zinc-200">Signed in</span>
          <span data-testid="sync-email" className="truncate text-xs text-zinc-500">
            {s.user.email ?? 'Google account'}
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              await signOut();
              toast('Signed out. Sessions stay on this device.');
            } catch (err) {
              toast(`Sign-out failed: ${errMsg(err)}`, { tone: 'error' });
            }
          }}
        >
          Sign out
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-zinc-200">Status</span>
          <span
            role="status"
            data-testid="sync-status"
            className={label.tone === 'error' ? 'text-xs text-rose-300' : 'text-xs text-zinc-500'}
          >
            {statusText}
          </span>
        </div>
        <Button
          disabled={s.status === 'syncing' || !s.online}
          onClick={async () => {
            await syncNow();
            const st = useSync.getState();
            if (st.status === 'error') toast(`Sync failed: ${st.error}`, { tone: 'error' });
          }}
        >
          Sync now
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        Chord data, keys, markers and MIDI sync. Audio recordings never leave this device. When the
        same session is edited on two devices, the later edit wins.
      </p>
    </div>
  );
}
