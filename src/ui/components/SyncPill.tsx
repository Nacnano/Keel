import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useSync } from '@/sync/store';
import { cx } from '../lib/cx';
import { syncLabel, useNow, type SyncTone } from '../lib/syncLabel';

const DOT: Record<SyncTone, string> = {
  muted: 'bg-zinc-500',
  ok: 'bg-emerald-400',
  busy: 'bg-violet-300 animate-pulse',
  error: 'bg-rose-400',
};

/** Small status pill linking to Settings → Account & sync. */
export function SyncPill({ className }: { className?: string }) {
  const state = useSync(
    useShallow((s) => ({
      configured: s.configured,
      user: s.user,
      status: s.status,
      lastSyncAt: s.lastSyncAt,
      online: s.online,
    })),
  );
  const now = useNow();
  const { text, tone } = syncLabel(state, now);
  return (
    <Link
      to="/settings"
      data-testid="sync-pill"
      aria-label={`Sync status: ${text}. Open sync settings`}
      className={cx(
        'inline-flex min-h-8 items-center gap-2 rounded-full bg-zinc-900 px-3 text-xs text-zinc-300 ring-1 ring-zinc-800 hover:text-white',
        className,
      )}
    >
      <span aria-hidden className={cx('size-2 rounded-full', DOT[tone])} />
      {text}
    </Link>
  );
}
