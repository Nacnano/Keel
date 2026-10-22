import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { mockChordRecords, mockKeyRecords, mockSession } from '@/core/mocks';
import { db, toJSON, getSessionFull } from '@/data';
import { LibraryScreen } from './LibraryScreen';

const DAY = 86_400_000;
const BASE = new Date(2026, 0, 1, 18, 0).getTime();

async function seed() {
  await db.sessions.bulkPut([
    mockSession({ id: 's1', name: 'Evening idea in C', createdAt: BASE, durationSec: 300 }),
    mockSession({
      id: 's2',
      name: 'Neo soul groove',
      tags: ['jazz', 'groove'],
      createdAt: BASE + DAY,
      durationSec: 900,
      summary: {
        keys: [{ key: { tonic: 2, mode: 'minor' }, seconds: 900 }],
        topProgressions: [],
        chordCount: 10,
        bookmarks: 0,
      },
    }),
    mockSession({
      id: 's3',
      name: 'Ballad sketch',
      tags: ['ballad', 'jazz'],
      createdAt: BASE + 2 * DAY,
      durationSec: 60,
    }),
  ]);
}

const renderAt = (path = '/library') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/library" element={<LibraryScreen />} />
        <Route path="/review/:id" element={<p>Review page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const cardNames = () =>
  screen.getAllByTestId('session-card').map((c) => within(c).getByRole('heading').textContent);

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});
afterEach(cleanup);

describe('LibraryScreen', () => {
  it('shows the first-run empty state', async () => {
    renderAt();
    expect(await screen.findByText('No jams saved yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start jamming' })).toHaveAttribute('href', '/');
    // Dev seed tools stay hidden without ?seed=1.
    expect(screen.queryByRole('button', { name: 'Seed demo session' })).toBeNull();
  });

  it('lists sessions newest first, sorts, and links cards to the review screen', async () => {
    await seed();
    renderAt();
    await screen.findAllByTestId('session-card');
    expect(cardNames()).toEqual(['Ballad sketch', 'Neo soul groove', 'Evening idea in C']);
    fireEvent.click(screen.getByRole('radio', { name: 'Longest' }));
    await waitFor(() =>
      expect(cardNames()).toEqual(['Neo soul groove', 'Evening idea in C', 'Ballad sketch']),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Oldest' }));
    await waitFor(() => expect(cardNames()[0]).toBe('Evening idea in C'));
    expect(screen.getByRole('link', { name: 'Neo soul groove' })).toHaveAttribute(
      'href',
      '/review/s2',
    );
    expect(screen.getByTestId('storage-line')).toHaveTextContent(/stored on this device|used/);
  });

  it('searches by name and key, and filters by tag chips', async () => {
    await seed();
    renderAt();
    await screen.findAllByTestId('session-card');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions' }), {
      target: { value: 'groove' },
    });
    await waitFor(() => expect(cardNames()).toEqual(['Neo soul groove']));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'D minor' } });
    await waitFor(() => expect(cardNames()).toEqual(['Neo soul groove']));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No sessions match.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(cardNames()).toHaveLength(3));

    const tags = within(screen.getByRole('group', { name: 'Filter by tag' }));
    expect(tags.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'All',
      'ballad',
      'groove',
      'idea',
      'jazz',
    ]);
    fireEvent.click(tags.getByRole('button', { name: 'jazz' }));
    await waitFor(() => expect(cardNames()).toEqual(['Ballad sketch', 'Neo soul groove']));
    expect(tags.getByRole('button', { name: 'jazz' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(tags.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(cardNames()).toHaveLength(3));
  });

  it('soft-deletes with an undo toast that restores the session', async () => {
    await seed();
    renderAt();
    await screen.findAllByTestId('session-card');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Neo soul groove' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(cardNames()).toEqual(['Ballad sketch', 'Evening idea in C']));
    expect((await db.sessions.get('s2'))?.deleted).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Deleted “Neo soul groove”');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(cardNames()).toHaveLength(3));
    expect((await db.sessions.get('s2'))?.deleted).toBe(false);
  });

  it('renames a session inline', async () => {
    await seed();
    renderAt();
    await screen.findAllByTestId('session-card');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Ballad sketch' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Session name' });
    fireEvent.change(input, { target: { value: 'Ballad in E' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(cardNames()).toContain('Ballad in E'));
    expect((await db.sessions.get('s3'))?.name).toBe('Ballad in E');
  });

  it('row menu offers the export actions, and share only when sync is signed in', async () => {
    await seed();
    renderAt();
    await screen.findAllByTestId('session-card');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Evening idea in C' }));
    const menu = within(screen.getByRole('menu', { name: 'Actions for Evening idea in C' }));
    expect(menu.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Rename',
      'Copy chord chart',
      'Download chart (.txt)',
      'Download JSON',
      'Delete',
    ]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('imports a JSON export as a new session', async () => {
    await db.sessions.put(mockSession({ id: 'src', name: 'Exported jam' }));
    await db.chords.bulkPut(mockChordRecords('src', 2));
    await db.keys.bulkPut(mockKeyRecords('src'));
    const json = JSON.stringify(toJSON((await getSessionFull('src'))!));
    renderAt();
    await screen.findAllByTestId('session-card');
    const file = new File([json], 'jam.json', { type: 'application/json' });
    // jsdom's File lacks text() in some versions.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(json) });
    fireEvent.change(screen.getByLabelText('Import session JSON file'), {
      target: { files: [file] },
    });
    await waitFor(() => expect(screen.getAllByTestId('session-card')).toHaveLength(2));
    expect(await db.sessions.count()).toBe(2);
  });

  it('?seed=1 offers a demo seed that writes the mock fixtures', async () => {
    renderAt('/library?seed=1');
    fireEvent.click(await screen.findByRole('button', { name: 'Seed demo session' }));
    await waitFor(() => expect(cardNames()).toEqual(['Evening idea in C']));
    const [s] = await db.sessions.toArray();
    expect(s.hasMidi).toBe(true);
    expect(s.summary?.chordCount).toBe(48);
    expect(await db.chords.count()).toBe(48);
    expect(await db.markers.count()).toBe(3);
    expect((await db.midiTracks.get(s.id))?.events.length).toBeGreaterThan(48 * 8);
  });
});
