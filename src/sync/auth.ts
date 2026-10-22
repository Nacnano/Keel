/**
 * Google sign-in through Supabase Auth (OAuth redirect, PKCE). Every function
 * is a no-op when sync is not configured.
 */
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './client';
import { syncStore, type SyncUser } from './store';

export function toSyncUser(user: User | null | undefined): SyncUser | null {
  return user ? { id: user.id, email: user.email ?? null } : null;
}

/**
 * Redirects to Google, then back to the current page. The client finishes the
 * sign-in on return (`detectSessionInUrl`).
 */
export async function signInWithGoogle(): Promise<void> {
  const client = await getSupabase();
  if (!client) throw new Error('Sync is not configured');
  const { origin, pathname } = window.location;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}${pathname}` },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const client = await getSupabase();
  if (!client) return;
  const { error } = await client.auth.signOut();
  syncStore.setState({ user: null, status: 'off', error: null });
  if (error) throw error;
}

/** The signed-in user from the persisted session (no network), or null. */
export async function currentUser(): Promise<SyncUser | null> {
  const client = await getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return toSyncUser(data.session?.user);
}

/**
 * Calls `cb` with the user on every auth change (sign-in, sign-out, token
 * refresh, initial session). Returns an unsubscribe function.
 */
export function onAuthChange(cb: (user: SyncUser | null) => void): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;
  void getSupabase().then((client) => {
    if (!client || cancelled) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      cb(toSyncUser(session?.user));
    });
    unsubscribe = () => data.subscription.unsubscribe();
  });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
