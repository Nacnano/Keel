/** Cloud sync (Supabase) and public share links. Inert unless configured. */
export { isSyncConfigured, getSupabase, SyncError } from './client';
export { signInWithGoogle, signOut, onAuthChange, currentUser } from './auth';
export {
  pushChanges,
  pullChanges,
  syncNow,
  startAutoSync,
  getCursors,
  DEFAULT_SYNC_INTERVAL_MS,
  type AutoSyncOptions,
  type PushResult,
  type PullResult,
  type SyncReport,
} from './engine';
export {
  createShare,
  fetchShare,
  revokeShare,
  listShares,
  shareUrl,
  buildSharePayload,
  type ShareLink,
  type SharedChart,
  type SharePayloadV1,
} from './share';
export { notifySessionSaved } from './signals';
export { useSync, syncStore, type SyncState, type SyncStatus, type SyncUser } from './store';
