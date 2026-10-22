import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mockChordRecords, mockKeyRecords, mockSession } from '@/core/mocks';
import { db } from '@/data/db';
import { enableSyncEnv, fake, TEST_USER } from '@/sync/testing/mockSupabase';
import { ShareDialog } from './ShareDialog';

vi.mock('@supabase/supabase-js', () => import('@/sync/testing/mockSupabase'));

const SID = 'dialog-session';

beforeEach(async () => {
  await resetDb();
  fake.reset();
  enableSyncEnv();
  fake.signIn(TEST_USER);
  await db.sessions.put(mockSession({ id: SID }));
  await db.chords.bulkPut(mockChordRecords(SID, 1));
  await db.keys.bulkPut(mockKeyRecords(SID));
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('ShareDialog', () => {
  it('creates a link on open, copies it, shows it and revokes it', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareDialog open onClose={() => {}} sessionId={SID} />);

    const input = await screen.findByRole('textbox', { name: 'Share URL' });
    const [row] = fake.rows('shares');
    expect((input as HTMLInputElement).value).toBe(`${window.location.origin}/s/${row.code}`);
    expect(writeText).toHaveBeenCalledWith((input as HTMLInputElement).value);
    expect(screen.getByText('Link copied to the clipboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await vi.waitFor(() => expect(fake.rows('shares')).toHaveLength(0));
    expect(await screen.findByText(/Link revoked/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Share URL' })).toBeNull();
  });

  it('reuses an existing link instead of creating another', async () => {
    const first = render(<ShareDialog open onClose={() => {}} sessionId={SID} />);
    await screen.findByRole('textbox', { name: 'Share URL' });
    first.unmount();
    render(<ShareDialog open onClose={() => {}} sessionId={SID} />);
    await screen.findByRole('textbox', { name: 'Share URL' });
    expect(fake.rows('shares')).toHaveLength(1);
  });
});
