import { resetDb } from '@/data/testing/setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { qualityName, randomChordQuestion, seededRng } from '@/theory';
import { loadPrefs, loadStats } from './train/stats';
import { createManualPlayback } from './train/testing';

vi.mock('@/app/live/audition', () => ({
  getPianoPlayer: () => {
    throw new Error('the screen test injects its own playback');
  },
  ensurePianoLoaded: () => Promise.resolve(),
}));

const { TrainScreen } = await import('./TrainScreen');

beforeEach(resetDb);
afterEach(cleanup);

describe('TrainScreen', () => {
  it('switches drills and shows key settings only where they apply', async () => {
    render(<TrainScreen playback={createManualPlayback()} rng={seededRng(1)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Train' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Chord vocabulary level' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Key set' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Progression numerals' }));
    expect(screen.getByRole('radiogroup', { name: 'Key set' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Tempo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('group', { name: 'Numerals' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('group', { name: 'Key wheel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'All 12' }));
    await waitFor(async () =>
      expect(await loadPrefs()).toMatchObject({ drill: 'key', keySet: 'all' }),
    );
  });

  it('persists per-drill accuracy and shows it after a reload', async () => {
    const playback = createManualPlayback();
    const expected = randomChordQuestion(1, seededRng(5));
    const view = render(<TrainScreen playback={playback} rng={seededRng(5)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: qualityName(expected.chord.quality) }));
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1');
    await waitFor(async () =>
      expect((await loadStats()).quality).toEqual({ attempts: 1, correct: 1, bestStreak: 1 }),
    );
    expect(screen.getByLabelText('Score')).toHaveTextContent('100%');

    view.unmount();
    render(<TrainScreen playback={createManualPlayback()} />);
    await waitFor(() => expect(screen.getByLabelText('Score')).toHaveTextContent('100%'));
    expect(screen.getByLabelText('Score')).toHaveTextContent('0/0');
  });
});
