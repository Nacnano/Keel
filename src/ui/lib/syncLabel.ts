import { useEffect, useState } from 'react';
import type { SyncState } from '@/sync/store';

/** "just now", "5 min ago", "2 h ago", "Oct 21". */
export function formatAgo(t: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export type SyncTone = 'muted' | 'ok' | 'busy' | 'error';

type PillState = Pick<SyncState, 'configured' | 'user' | 'status' | 'lastSyncAt' | 'online'>;

/** Short status text and tone for the current sync state. */
export function syncLabel(s: PillState, now = Date.now()): { text: string; tone: SyncTone } {
  if (!s.configured) return { text: 'Local only', tone: 'muted' };
  if (!s.user) return { text: 'Sync off', tone: 'muted' };
  if (!s.online) return { text: 'Offline', tone: 'muted' };
  if (s.status === 'syncing') return { text: 'Syncing…', tone: 'busy' };
  if (s.status === 'error') return { text: 'Sync error', tone: 'error' };
  if (s.lastSyncAt) return { text: `Synced ${formatAgo(s.lastSyncAt, now)}`, tone: 'ok' };
  return { text: 'Sync pending', tone: 'busy' };
}

/** Re-render every 30 s so "Synced n min ago" stays fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
