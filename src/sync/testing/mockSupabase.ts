/**
 * Shared fake for `vi.mock('@supabase/supabase-js', ...)` in tests:
 *
 *   import { fake, enableSyncEnv } from '@/sync/testing/mockSupabase';
 *   vi.mock('@supabase/supabase-js', () => import('@/sync/testing/mockSupabase'));
 *
 * The module doubles as the mocked package (it exports `createClient`).
 */
import { vi } from 'vitest';
import { resetSupabaseClient } from '../client';
import { createFakeSupabase } from './fakeSupabase';

export const fake = createFakeSupabase();

export function createClient() {
  return fake.client;
}

export const TEST_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'me@example.com' };

/** Stub the two env vars and drop any cached client. */
export function enableSyncEnv(): void {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-test-key');
  resetSupabaseClient();
}

/** Blank the env vars (unconfigured deployment). */
export function disableSyncEnv(): void {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  resetSupabaseClient();
}
