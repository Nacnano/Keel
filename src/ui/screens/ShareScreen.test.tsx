import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import { mockChordRecords, mockKeyRecords, mockMarkers, mockSession } from '@/core/mocks';
import { db } from '@/data/db';
import { getSessionFull } from '@/data/repo';
import { buildSharePayload } from '@/sync/share';
import { disableSyncEnv, enableSyncEnv, fake } from '@/sync/testing/mockSupabase';
import { ShareScreen } from './ShareScreen';

vi.mock('@supabase/supabase-js', () => import('@/sync/testing/mockSupabase'));

const SID = 'shared-1';
const CODE = 'AbCdEf1234';

function ReviewStub() {
  const { id } = useParams();
  return <p data-testid="review-stub">{id}</p>;
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/s/:code', Component: ShareScreen },
      { path: '/review/:id', Component: ReviewStub },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
  await resetDb();
  fake.reset();
  enableSyncEnv();
  const payload = buildSharePayload({
    session: mockSession({ id: SID, name: 'Shared groove' }),
    chords: mockChordRecords(SID, 4),
    keys: mockKeyRecords(SID),
    markers: mockMarkers(SID),
  });
  fake.rows('shares').push({ code: CODE, user_id: 'u', session_id: SID, payload, created_at: 1 });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('ShareScreen', () => {
  it('renders a shared chart read-only, logged out', async () => {
    renderAt(`/s/${CODE}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Shared groove' })).toBeVisible();
    expect(screen.getByTestId('share-keys')).toHaveTextContent('C major');
    const chart = screen.getByRole('list', { name: 'Chord chart' });
    // POP_PROGRESSION C G Am F, with numerals relative to C major.
    for (const sym of ['C', 'G', 'Am', 'F']) expect(chart).toHaveTextContent(sym);
    const numerals = screen.getAllByTestId('numeral').map((n) => n.textContent);
    expect(numerals).toEqual(expect.arrayContaining(['I', 'V', 'vi', 'IV']));
    expect(chart).toHaveTextContent('×');
    expect(screen.getByRole('heading', { name: /intro/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bookmarks' })).toHaveTextContent('1:00 nice');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('imports the chart with "Open in Keel"', async () => {
    renderAt(`/s/${CODE}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Open in Keel' }));
    const id = (await screen.findByTestId('review-stub')).textContent!;
    expect(id).not.toBe(SID);
    const full = await getSessionFull(id);
    expect(full?.session.name).toBe('Shared groove');
    expect(full?.chords).toHaveLength(16);
    expect(await db.sessions.count()).toBe(1);
  });

  it('shows a not-found state for unknown or revoked codes', async () => {
    renderAt('/s/nothingHere');
    expect(await screen.findByRole('heading', { name: 'Chart not found' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Chart not found' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Keel' })).toHaveAttribute('href', '/');
  });

  it('shows a loading state, then the chart', async () => {
    renderAt(`/s/${CODE}`);
    expect(screen.getByRole('status')).toHaveTextContent('Loading chart');
    expect(await screen.findByRole('heading', { level: 1, name: 'Shared groove' })).toBeVisible();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows an empty state for a chart without chords', async () => {
    const payload = buildSharePayload({
      session: mockSession({ id: 'empty', name: 'Silent take' }),
      chords: [],
      keys: [],
      markers: [],
    });
    fake
      .rows('shares')
      .push({ code: 'Empty00000', user_id: 'u', session_id: 'empty', payload, created_at: 1 });
    renderAt('/s/Empty00000');
    expect(await screen.findByRole('heading', { level: 1, name: 'Silent take' })).toBeVisible();
    expect(screen.getByText('This chart has no chords.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Chord chart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open in Keel' })).toBeEnabled();
  });

  it('explains when sharing is not configured', async () => {
    disableSyncEnv();
    renderAt(`/s/${CODE}`);
    expect(
      await screen.findByRole('heading', { name: 'Sharing is not available' }),
    ).toBeInTheDocument();
  });
});
