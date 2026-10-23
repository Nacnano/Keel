import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useSync } from '@/sync/store';
import { Badge, type BadgeTone } from '../kit';
import { cx } from '../lib/cx';
import { syncLabel, useNow, type SyncTone } from '../lib/syncLabel';

const TONE: Record<SyncTone, BadgeTone> = {
  muted: 'neutral',
  ok: 'ok',
  busy: 'accent',
  error: 'live',
};

/** Small status badge linking to Settings → Account & sync. */
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
  // Without cloud sync there is nothing to report or set up.
  if (!state.configured) return null;
  return (
    <Link
      to="/settings"
      data-testid="sync-pill"
      aria-label={`Sync status: ${text}. Open sync settings`}
      className={cx('inline-flex rounded-full transition-opacity hover:opacity-80', className)}
    >
      <Badge tone={TONE[tone]} className="gap-1.5 font-medium">
        <span
          aria-hidden
          className={cx('size-1.5 rounded-full bg-current', tone === 'busy' && 'anim-pulse-soft')}
        />
        {text}
      </Badge>
    </Link>
  );
}
