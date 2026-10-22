import { afterEach, describe, expect, it, vi } from 'vitest';

const player = { isLoaded: vi.fn(() => true), noteOn: vi.fn(), noteOff: vi.fn() };
const ensurePianoLoaded = vi.fn(() => Promise.resolve());

vi.mock('@/app/live/audition', () => ({
  getPianoPlayer: () => player,
  ensurePianoLoaded,
}));

const { playNotes } = await import('./playNotes');

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('playNotes', () => {
  it('plays the exact notes on the sampled piano and releases the previous tap', () => {
    vi.useFakeTimers();
    playNotes([36, 64, 67]);
    expect(player.noteOn.mock.calls.map((c) => c[0])).toEqual([36, 64, 67]);
    playNotes([41, 65]);
    expect(player.noteOff.mock.calls.map((c) => c[0])).toEqual([36, 64, 67]);
    vi.runAllTimers();
    expect(player.noteOff.mock.calls.map((c) => c[0])).toEqual([36, 64, 67, 41, 65]);
  });

  it('starts loading the samples when the piano is not ready', () => {
    player.isLoaded.mockReturnValueOnce(false);
    playNotes([60]);
    expect(player.noteOn).not.toHaveBeenCalled();
    expect(ensurePianoLoaded).toHaveBeenCalledOnce();
  });
});
