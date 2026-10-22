import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { initialSyncState, syncStore } from '@/sync/store';
import { disableSyncEnv, enableSyncEnv, fake, TEST_USER } from '@/sync/testing/mockSupabase';
import { ExportMenu } from '../library/ExportMenu';
import { SettingsScreen } from '../SettingsScreen';
import { SyncPill } from '../../components/SyncPill';
import { formatAgo, syncLabel } from '../../lib/syncLabel';
import { SUPABASE_SETUP_URL } from './AccountSync';

vi.mock('@supabase/supabase-js', () => import('@/sync/testing/mockSupabase'));

const renderSettings = () =>
  render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );

beforeEach(async () => {
  await resetDb();
  fake.reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('Settings → Account & sync', () => {
  it('explains the unconfigured state when the env vars are missing', () => {
    disableSyncEnv();
    syncStore.setState(initialSyncState());
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Account & sync' })).toBeInTheDocument();
    expect(screen.getByTestId('sync-unconfigured')).toHaveTextContent('Sync is not configured');
    expect(screen.getByRole('link', { name: 'supabase/README.md' })).toHaveAttribute(
      'href',
      SUPABASE_SETUP_URL,
    );
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('offers Google sign-in when configured and signed out', async () => {
    enableSyncEnv();
    syncStore.setState(initialSyncState());
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await vi.waitFor(() =>
      expect(fake.calls.find((c) => c.table === 'auth')?.rows?.[0]).toMatchObject({
        provider: 'google',
      }),
    );
  });

  it('shows the account, status and Sync now when signed in', async () => {
    enableSyncEnv();
    fake.signIn(TEST_USER);
    syncStore.setState({
      ...initialSyncState(),
      user: { id: TEST_USER.id, email: TEST_USER.email },
      status: 'idle',
    });
    renderSettings();
    expect(screen.getByTestId('sync-email')).toHaveTextContent(TEST_USER.email);
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Not synced yet');
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await vi.waitFor(() =>
      expect(screen.getByTestId('sync-status')).toHaveTextContent('Last synced just now'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });
});

describe('sync status pill', () => {
  const base = { configured: true, user: { id: 'u', email: null }, online: true } as const;

  it('labels every state', () => {
    const now = 10_000_000;
    expect(syncLabel({ ...base, configured: false, status: 'off', lastSyncAt: null }).text).toBe(
      'Local only',
    );
    expect(syncLabel({ ...base, user: null, status: 'off', lastSyncAt: null }).text).toBe(
      'Sync off',
    );
    expect(syncLabel({ ...base, status: 'syncing', lastSyncAt: null }).text).toBe('Syncing…');
    expect(syncLabel({ ...base, status: 'error', lastSyncAt: null }).tone).toBe('error');
    expect(syncLabel({ ...base, online: false, status: 'idle', lastSyncAt: null }).text).toBe(
      'Offline',
    );
    expect(syncLabel({ ...base, status: 'idle', lastSyncAt: now - 5 * 60_000 }, now).text).toBe(
      'Synced 5 min ago',
    );
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
  });

  it('renders as a link to settings', () => {
    disableSyncEnv();
    syncStore.setState(initialSyncState());
    render(
      <MemoryRouter>
        <SyncPill />
      </MemoryRouter>,
    );
    const pill = screen.getByTestId('sync-pill');
    expect(pill).toHaveTextContent('Local only');
    expect(pill).toHaveAttribute('href', '/settings');
  });
});

describe('export menu share item', () => {
  it('is disabled with a hint when sharing is unavailable', () => {
    const onSelect = vi.fn();
    render(
      <ExportMenu
        getFull={async () => undefined}
        share={{ onSelect, disabledReason: 'Sign in to share.' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const item = screen.getByRole('menuitem', { name: 'Share link…' });
    expect(item).toBeDisabled();
    expect(item).toHaveAccessibleDescription('Sign in to share.');
  });

  it('calls onSelect when enabled', () => {
    const onSelect = vi.fn();
    render(<ExportMenu getFull={async () => undefined} share={{ onSelect }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share link…' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
