import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { signInWithGoogle, signOut } from '@/sync/auth';
import { syncNow } from '@/sync/engine';
import { useSync } from '@/sync/store';
import { Button, Group, Row } from '../../kit';
import { cx } from '../../lib/cx';
import { formatAgo, syncLabel, useNow } from '../../lib/syncLabel';
import { toast } from '../../components/toastStore';

export const SUPABASE_SETUP_URL = 'https://github.com/Nacnano/music/blob/main/supabase/README.md';

const TITLE = 'Account & sync';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Settings → "Account & sync" group. */
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
      <Group
        title={TITLE}
        footer={
          <span data-testid="sync-unconfigured">
            Sync is not configured. Sessions are saved on this device only; cloud sync, Google
            sign-in and share links need a Supabase project, set up as described in{' '}
            <a
              href={SUPABASE_SETUP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              supabase/README.md
            </a>
            .
          </span>
        }
      >
        <Row label="Cloud sync" accessory="Not set up" />
      </Group>
    );
  }

  if (!s.user) {
    return (
      <Group
        title={TITLE}
        footer="Back up your chord charts and open them on other devices. Audio recordings stay on this device."
      >
        <Row
          label={<span className="text-accent">Sign in with Google</span>}
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
        />
      </Group>
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
    <Group
      title={TITLE}
      footer="Chord data, keys, markers and MIDI sync. Audio recordings never leave this device. When the same session is edited on two devices, the later edit wins."
    >
      <Row
        label="Account"
        accessory={
          <span data-testid="sync-email" className="max-w-56 truncate">
            {s.user.email ?? 'Google account'}
          </span>
        }
      />
      <Row
        label="Status"
        detail={
          <span
            role="status"
            data-testid="sync-status"
            className={cx(label.tone === 'error' && 'text-live')}
          >
            {statusText}
          </span>
        }
        accessory={
          <Button
            variant="plain"
            size="sm"
            disabled={s.status === 'syncing' || !s.online}
            onClick={async () => {
              await syncNow();
              const st = useSync.getState();
              if (st.status === 'error') toast(`Sync failed: ${st.error}`, { tone: 'error' });
            }}
          >
            Sync now
          </Button>
        }
      />
      <Row
        label={<span className="text-live">Sign out</span>}
        onClick={async () => {
          try {
            await signOut();
            toast('Signed out. Sessions stay on this device.');
          } catch (err) {
            toast(`Sign-out failed: ${errMsg(err)}`, { tone: 'error' });
          }
        }}
      />
    </Group>
  );
}
