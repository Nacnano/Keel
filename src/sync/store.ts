/**
 * Reactive sync state for the UI (Settings, Library pill, share dialog). The
 * engine and auth modules write it; components read it with `useSync`.
 */
import { create } from 'zustand';
import { isSyncConfigured } from './client';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

export interface SyncUser {
  id: string;
  email: string | null;
}

export interface SyncState {
  /** Env vars present at build time. */
  configured: boolean;
  /** Signed-in Supabase user, or null. */
  user: SyncUser | null;
  /** `off` when unconfigured or signed out. */
  status: SyncStatus;
  /** Epoch ms of the last successful sync, or null. */
  lastSyncAt: number | null;
  /** Message of the last failed sync (cleared on success). */
  error: string | null;
  online: boolean;
}

export function initialSyncState(): SyncState {
  return {
    configured: isSyncConfigured(),
    user: null,
    status: 'off',
    lastSyncAt: null,
    error: null,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  };
}

export const useSync = create<SyncState>()(() => initialSyncState());

export const syncStore = useSync;
