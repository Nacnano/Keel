import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Chord, Key } from '@/core';
import { parseChord } from '@/theory';
import { ReharmPanel, type ReharmSource } from './ReharmPanel';
import { playProgression, prettyProse, progressionText } from './ReharmPanel.logic';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const C: Key = { tonic: 0, mode: 'major' };
const prog = (s: string): Chord[] => s.split(' ').map((x) => parseChord(x)!);
const sources: ReharmSource[] = [
  { id: 'a', label: 'Top 1 ×4', chords: prog('Dm7 G7 Cmaj7'), key: C },
  { id: 'b', label: 'Top 2 ×2', chords: prog('C G Am F'), key: C },
];

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /Reharmonize/ }));
const alternatives = () => screen.getAllByTestId('reharm-alternative');

describe('ReharmPanel', () => {
  it('is collapsed by default and lists alternatives when opened', () => {
    render(<ReharmPanel sources={sources} onAudition={vi.fn()} />);
    expect(screen.queryByTestId('reharm-alternative')).toBeNull();
    openPanel();
    expect(screen.getByRole('button', { name: /Reharmonize/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // pop by default: first alternative swaps ii for IV
    expect(alternatives()[0]).toHaveTextContent('Fmaj7IVmaj7G7V7Cmaj7Imaj7');
    expect(alternatives()[0]).toHaveTextContent('same predominant function');
  });

  it('switches style and source', () => {
    render(<ReharmPanel sources={sources} onAudition={vi.fn()} defaultOpen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Jazz' }));
    expect(alternatives()[0]).toHaveTextContent('Dm7ii7D♭7♭II7Cmaj7Imaj7');
    expect(alternatives()[0]).toHaveTextContent('tritone sub for G7');
    fireEvent.click(screen.getByRole('button', { name: 'Top 2 ×2' }));
    expect(screen.getByRole('button', { name: 'Top 2 ×2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(alternatives().length).toBeGreaterThan(0);
  });

  it('plays an alternative chord by chord and can stop it', () => {
    vi.useFakeTimers();
    const onAudition = vi.fn();
    render(<ReharmPanel sources={sources} onAudition={onAudition} defaultOpen stepMs={500} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Jazz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play alternative 1' }));
    expect(onAudition).toHaveBeenCalledTimes(1);
    expect(onAudition).toHaveBeenLastCalledWith({ root: 2, quality: 'min7' });
    act(() => vi.advanceTimersByTime(500));
    expect(onAudition).toHaveBeenLastCalledWith({ root: 1, quality: '7' });
    expect(screen.getByRole('button', { name: 'Play alternative 1' })).toHaveTextContent('Stop');
    fireEvent.click(screen.getByRole('button', { name: 'Play alternative 1' }));
    act(() => vi.advanceTimersByTime(2000));
    expect(onAudition).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Play alternative 1' })).toHaveTextContent('Play');
  });

  it('plays the original', () => {
    const onAudition = vi.fn();
    render(<ReharmPanel sources={sources} onAudition={onAudition} defaultOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Play original' }));
    expect(onAudition).toHaveBeenCalledWith({ root: 2, quality: 'min7' });
  });

  it('copies an alternative as text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ReharmPanel sources={sources} onAudition={vi.fn()} defaultOpen />);
    fireEvent.click(screen.getByRole('radio', { name: 'Jazz' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy alternative 1' }));
    });
    expect(writeText).toHaveBeenCalledWith('Dm7 Db7 Cmaj7 | ii7 bII7 Imaj7');
  });

  it('captures chords from the playhead on demand', () => {
    const capture = vi.fn(() => ({ chords: prog('C Am Dm G'), key: C }));
    render(<ReharmPanel sources={[]} capture={capture} onAudition={vi.fn()} defaultOpen />);
    expect(screen.getByText(/No progression to work with yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use chords at playhead' }));
    expect(capture).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'From playhead' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const original = screen.getByText('Original').parentElement!;
    expect(within(original).getByText('Dm')).toBeInTheDocument();
    expect(alternatives().length).toBeGreaterThan(0);
  });
});

describe('helpers', () => {
  it('progressionText gives symbols and numerals', () => {
    expect(progressionText(prog('C Am/E F G7'), C)).toBe('C Am/E F G7 | I vi IV V7');
  });

  it('playProgression schedules each chord and reports completion', () => {
    vi.useFakeTimers();
    const audition = vi.fn();
    const done = vi.fn();
    playProgression(prog('C F G'), audition, 100, done);
    expect(audition).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(250);
    expect(audition).toHaveBeenCalledTimes(3);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(done).toHaveBeenCalled();
  });
});

describe('prettyProse', () => {
  it('only converts accidentals inside notes, chord symbols and numerals', () => {
    expect(prettyProse('iv: borrowed from C minor, bittersweet')).toBe(
      'iv: borrowed from C minor, bittersweet',
    );
    expect(prettyProse('bVII: from the parallel minor, an obvious lift')).toBe(
      '♭VII: from the parallel minor, an obvious lift',
    );
    expect(prettyProse('Bb major (Db7 as V7/IV), F#m7b5 is about tension')).toBe(
      'B♭ major (D♭7 as V7/IV), F♯m7♭5 is about tension',
    );
  });
});
