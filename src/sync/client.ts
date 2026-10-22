/**
 * Supabase client, created lazily and only when the deployment is configured
 * (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`). Without them the whole sync
 * layer is inert and `@supabase/supabase-js` is never downloaded: it is loaded
 * with a dynamic import on first use.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient };

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

interface SyncEnv {
  url: string;
  anonKey: string;
}

function readEnv(): SyncEnv | null {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return url && anonKey ? { url, anonKey } : null;
}

/** True when both Supabase env vars are present at build time. */
export function isSyncConfigured(): boolean {
  return readEnv() !== null;
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * The app-wide Supabase client (lazy singleton), or `null` when sync is not
 * configured. Safe to call often; the client is created once.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  const env = readEnv();
  if (!env) return Promise.resolve(null);
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(env.url, env.anonKey, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'jamkey-auth',
        },
      }),
    )
    .catch((err: unknown) => {
      clientPromise = null; // allow a retry, e.g. after the chunk failed to load offline
      throw err;
    });
  return clientPromise;
}

/** Test hook: forget the cached client so the next call re-reads the env. */
export function resetSupabaseClient(): void {
  clientPromise = null;
}
