import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Chord, Key } from '@/core';
import { mockSession } from '@/core/mocks';
import { db } from '@/data';
import { StatsScreen } from './StatsScreen';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const POP: Chord[] = [
  { root: 0, quality: 'maj' },
  { root: 7, quality: 'maj' },
  { root: 9, quality: 'min' },
  { root: 5, quality: 'maj' },
];
const II_V_I: Chord[] = [
  { root: 2, quality: 'min7' },
  { root: 7, quality: '7' },
  { root: 0, quality: 'maj7' },
];

/** Local 6 pm, `daysAgo` days before today. */
const at = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
};

async function seed() {
  await db.sessions.bulkPut([
    mockSession({
      id: 'a',
      createdAt: at(0),
      durationSec: 1200,
      summary: {
        keys: [{ key: C, seconds: 1200 }],
        topProgressions: [{ chords: POP, count: 10 }],
        chordCount: 40,
        bookmarks: 0,
      },
    }),
    mockSession({
      id: 'b',
      createdAt: at(1),
      durationSec: 600,
      summary: {
        keys: [
          { key: C, seconds: 300 },
          { key: Am, seconds: 300 },
        ],
        topProgressions: [{ chords: II_V_I, count: 4 }],
        chordCount: 12,
        bookmarks: 0,
      },
    }),
    // Outside the 30-day default range.
    mockSession({ id: 'old', createdAt: at(60), durationSec: 3600, summary: null }),
  ]);
}

const renderScreen = () =>
  render(
    <MemoryRouter>
      <StatsScreen />
    </MemoryRouter>,
  );

const tile = (label: string) =>
  screen.getAllByTestId('stats-tile').find((t) => within(t).queryByText(label))!;

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});
afterEach(cleanup);

describe('StatsScreen', () => {
  it('shows the empty state with no sessions', async () => {
    renderScreen();
    expect(await screen.findByText('No jams to count yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a jam' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('radiogroup', { name: 'Time range' })).not.toBeInTheDocument();
  });

  it('renders tiles, the day strip, keys, progressions, qualities and nudges', async () => {
    await seed();
    renderScreen();
    await screen.findAllByTestId('stats-tile');

    expect(within(tile('Time played')).getByText('30m')).toBeInTheDocument();
    expect(within(tile('Sessions')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Current streak')).getByText('2 days')).toBeInTheDocument();
    expect(within(tile('Longest streak')).getByText('2 days')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /Time played per day/ })).toBeInTheDocument();
    expect(screen.getAllByTestId('day-bar')).toHaveLength(30);

    const keys = screen.getAllByTestId('stats-key');
    expect(keys.map((k) => k.textContent)).toEqual([
      expect.stringContaining('C major'),
      expect.stringContaining('A minor'),
    ]);
    expect(screen.getByRole('meter', { name: /C major: 25 minutes, 83%/ })).toBeInTheDocument();

    const progs = screen.getAllByTestId('stats-progression');
    expect(progs).toHaveLength(2);
    expect(progs[0]).toHaveTextContent(/C\s*I\s*G\s*V\s*Am\s*vi\s*F\s*IV/);
    expect(progs[0]).toHaveTextContent('×10');
    expect(progs[1]).toHaveTextContent(/Dm7\s*ii7/);

    const qualities = screen.getAllByTestId('stats-quality').map((q) => q.textContent);
    expect(qualities[0]).toBe('Major30');
    expect(qualities).toContain('Dominant 74');

    const nudges = within(screen.getByRole('region', { name: 'Try jamming in…' })).getAllByRole(
      'link',
    );
    expect(nudges).toHaveLength(3);
    expect(nudges[0]).toHaveAttribute('href', expect.stringMatching(/^\/\?key=/));
    expect(nudges.map((n) => n.textContent)).not.toContain('C major');
  });

  it('switches range', async () => {
    await seed();
    renderScreen();
    await screen.findAllByTestId('stats-tile');
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }));
    await waitFor(() => expect(within(tile('Sessions')).getByText('3')).toBeInTheDocument());
    expect(within(tile('Time played')).getByText('1h 30m')).toBeInTheDocument();
  });

  it('offers all time when the range is empty', async () => {
    await db.sessions.put(mockSession({ id: 'old', createdAt: at(60), durationSec: 120 }));
    renderScreen();
    expect(await screen.findByText('No jams in the last 30 days.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all time' }));
    await waitFor(() => expect(screen.getAllByTestId('stats-key')).toHaveLength(1));
  });
});
