import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  keyName,
  keyPool,
  prettyAccidentals,
  qualityName,
  randomChordQuestion,
  randomKeyQuestion,
  randomProgressionQuestion,
  relativeKey,
  seededRng,
} from '@/theory';
import { createFakePlayer } from './testing';
import type { DrillProps } from './parts';
import { emptyStats } from './stats';

// The real playback module over a fake piano: no AudioContext in jsdom.
const fake = vi.hoisted(() => ({ player: null as unknown }));
vi.mock('@/app/live/audition', () => ({
  getPianoPlayer: () => fake.player,
  ensurePianoLoaded: () => Promise.resolve(),
}));

const { createPianoPlayback } = await import('./playback');
const { ChordQualityDrill } = await import('./ChordQualityDrill');
const { ProgressionDrill } = await import('./ProgressionDrill');
const { KeyDrill } = await import('./KeyDrill');

let player: ReturnType<typeof createFakePlayer>;
beforeEach(() => {
  player = createFakePlayer();
  fake.player = player;
});
afterEach(cleanup);

const SEED = 21;
const keys = keyPool('all', 'both');

function props(
  overrides: Partial<DrillProps> = {},
): DrillProps & { onGraded: ReturnType<typeof vi.fn> } {
  return {
    level: 1,
    keys,
    bpm: 120,
    playback: createPianoPlayback(),
    lifetime: emptyStats().quality,
    rng: seededRng(SEED),
    onGraded: vi.fn(),
    ...overrides,
  } as DrillProps & { onGraded: ReturnType<typeof vi.fn> };
}

/** Flush the async piano start. */
const settle = () => act(async () => {});

describe('ChordQualityDrill', () => {
  it('plays a chord, renders the pool and grades a right tap', async () => {
    const p = props({ level: 2 });
    const expected = randomChordQuestion(2, seededRng(SEED));
    render(<ChordQualityDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await settle();
    expect(player.plays).toHaveLength(1);

    const group = screen.getByRole('group', { name: 'Chord quality' });
    expect(within(group).getAllByRole('button')).toHaveLength(expected.choices.length);
    act(() => player.end());
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Your answer?');

    fireEvent.click(
      within(group).getByRole('button', { name: qualityName(expected.chord.quality) }),
    );
    expect(p.onGraded).toHaveBeenCalledWith(true, 1);
    const fb = screen.getByRole('region', { name: 'Feedback' });
    expect(fb).toHaveTextContent(`Correct: ${qualityName(expected.chord.quality)}`);
    expect(screen.getByLabelText('Score')).toHaveTextContent('1/1');

    fireEvent.click(within(fb).getByRole('button', { name: 'Play correct' }));
    await settle();
    expect(player.plays).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await settle();
    expect(player.plays).toHaveLength(3);
    expect(screen.queryByRole('region', { name: 'Feedback' })).toBeNull();
  });

  it('a wrong tap shows the answer and offers "play yours"', async () => {
    const p = props();
    const expected = randomChordQuestion(1, seededRng(SEED));
    render(<ChordQualityDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const wrong = expected.choices.find((q) => q !== expected.chord.quality)!;
    fireEvent.click(screen.getByRole('button', { name: qualityName(wrong) }));
    expect(p.onGraded).toHaveBeenCalledWith(false, 0);
    const fb = screen.getByRole('region', { name: 'Feedback' });
    expect(fb).toHaveTextContent(`It was ${qualityName(expected.chord.quality)}`);
    expect(within(fb).getByRole('button', { name: /Play yours/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: qualityName(expected.chord.quality) }),
    ).toHaveAttribute('data-mark', 'right');
    expect(screen.getByRole('button', { name: qualityName(wrong) })).toHaveAttribute(
      'data-mark',
      'wrong',
    );
  });
});

describe('ProgressionDrill', () => {
  it('fills four slots from numeral chips and grades them', async () => {
    const p = props();
    const expected = randomProgressionQuestion({
      rng: seededRng(SEED),
      level: 1,
      keys,
      length: 4,
    });
    render(<ProgressionDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await settle();
    // cadence (4) + progression (4) chords, each with a bass + 3 notes
    const ons = player.plays[0].filter((e) => e.type === 'on');
    expect(ons.length).toBe(8 * 4);
    expect(screen.getByText(prettyAccidentals(keyName(expected.key)))).toBeInTheDocument();

    const chips = screen.getByRole('group', { name: 'Numerals' });
    expect(within(chips).getAllByRole('button')).toHaveLength(expected.choices.length);
    const check = screen.getByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();
    // three right, the last one wrong
    const wrong = expected.choices.find((c) => c.numeral !== expected.numerals[3])!.numeral;
    for (const n of [...expected.numerals.slice(0, 3), wrong]) {
      fireEvent.click(within(chips).getByRole('button', { name: n }));
    }
    expect(check).toBeEnabled();
    fireEvent.click(check);
    expect(p.onGraded).toHaveBeenCalledWith(false, 0);
    const fb = screen.getByRole('region', { name: 'Feedback' });
    expect(fb).toHaveTextContent('3 of 4 right');
    expect(within(fb).getByRole('button', { name: 'Play yours' })).toBeInTheDocument();
    const slots = within(screen.getByRole('list', { name: 'Progression slots' })).getAllByRole(
      'button',
    );
    expect(slots.map((s) => s.className.includes('emerald'))).toEqual([true, true, true, false]);
  });

  it('tapping a slot re-targets it', () => {
    const p = props();
    const expected = randomProgressionQuestion({ rng: seededRng(SEED), level: 1, keys, length: 4 });
    render(<ProgressionDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    const chips = screen.getByRole('group', { name: 'Numerals' });
    const [a, b] = expected.choices;
    fireEvent.click(within(chips).getByRole('button', { name: a.numeral }));
    fireEvent.click(screen.getByRole('button', { name: `Chord 1: ${a.numeral}` }));
    fireEvent.click(within(chips).getByRole('button', { name: b.numeral }));
    expect(screen.getByRole('button', { name: `Chord 1: ${b.numeral}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chord 2: empty' })).toBeInTheDocument();
  });
});

describe('KeyDrill', () => {
  it('renders a 12-key wheel with a mode toggle and grades a tap', async () => {
    const p = props();
    const expected = randomKeyQuestion({ rng: seededRng(SEED), keys, level: 1 });
    render(<KeyDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await settle();
    expect(player.plays).toHaveLength(1);
    const wheel = screen.getByRole('group', { name: 'Key wheel' });
    expect(within(wheel).getAllByRole('button')).toHaveLength(12);

    if (expected.key.mode === 'minor') {
      fireEvent.click(screen.getByRole('radio', { name: 'Minor' }));
    }
    fireEvent.click(within(wheel).getByRole('button', { name: keyName(expected.key) }));
    expect(p.onGraded).toHaveBeenCalledWith(true, 1);
    expect(screen.getByRole('region', { name: 'Feedback' })).toHaveTextContent('Correct');
  });

  it('names a relative-key near miss', () => {
    const p = props();
    const expected = randomKeyQuestion({ rng: seededRng(SEED), keys, level: 1 });
    const rel = relativeKey(expected.key);
    render(<KeyDrill {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    if (rel.mode === 'minor') fireEvent.click(screen.getByRole('radio', { name: 'Minor' }));
    fireEvent.click(screen.getByRole('button', { name: keyName(rel) }));
    expect(p.onGraded).toHaveBeenCalledWith(false, 0);
    expect(screen.getByRole('region', { name: 'Feedback' })).toHaveTextContent('relative key');
  });
});
