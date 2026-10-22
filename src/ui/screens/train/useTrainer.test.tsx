import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createManualPlayback } from './testing';
import { useTrainer } from './useTrainer';

interface Q {
  n: number;
}

function setup() {
  const playback = createManualPlayback();
  let n = 0;
  const onGraded = vi.fn();
  const hook = renderHook(() =>
    useTrainer<Q, number, { correct: boolean }>({
      generate: () => ({ n: ++n }),
      clip: (q) => ({ bpm: 60, steps: [{ notes: [60 + q.n], beats: 1 }] }),
      grade: (q, a) => ({ correct: q.n === a }),
      playback,
      onGraded,
    }),
  );
  /** Let the clip's `done` promise settle. */
  const flush = () => act(async () => {});
  return { playback, onGraded, hook, flush };
}

describe('useTrainer', () => {
  it('idle → playing → answering → feedback → playing', async () => {
    const { playback, hook, flush } = setup();
    expect(hook.result.current.phase).toBe('idle');

    act(() => hook.result.current.next());
    expect(hook.result.current.phase).toBe('playing');
    expect(hook.result.current.question).toEqual({ n: 1 });
    expect(hook.result.current.sounding).toBe(true);
    expect(playback.clips).toHaveLength(1);

    act(() => playback.finish());
    await flush();
    expect(hook.result.current.phase).toBe('answering');

    act(() => hook.result.current.submit(1));
    expect(hook.result.current.phase).toBe('feedback');
    expect(hook.result.current.grade).toEqual({ correct: true });
    expect(hook.result.current.answer).toBe(1);

    act(() => hook.result.current.next());
    expect(hook.result.current.phase).toBe('playing');
    expect(hook.result.current.question).toEqual({ n: 2 });
    expect(hook.result.current.answer).toBeNull();
  });

  it('keeps score and streak, and reports each grade', () => {
    const { hook, onGraded } = setup();
    const answer = (right: boolean) => {
      act(() => hook.result.current.next());
      const q = hook.result.current.question!;
      act(() => hook.result.current.submit(right ? q.n : -1));
    };
    answer(true);
    answer(true);
    expect(hook.result.current.streak).toBe(2);
    answer(false);
    answer(true);
    const s = hook.result.current;
    expect(s.score).toEqual({ correct: 3, total: 4 });
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(onGraded.mock.calls.map(([g, streak]) => [g.correct, streak])).toEqual([
      [true, 1],
      [true, 2],
      [false, 0],
      [true, 1],
    ]);
  });

  it('answering while the clip plays cancels it; a second submit is ignored', async () => {
    const { playback, hook, onGraded, flush } = setup();
    act(() => hook.result.current.next());
    act(() => hook.result.current.submit(1));
    expect(playback.cancelled).toBe(1);
    await flush();
    expect(hook.result.current.phase).toBe('feedback');
    act(() => hook.result.current.submit(1));
    expect(onGraded).toHaveBeenCalledTimes(1);
  });

  it('ignores submit before a question exists', () => {
    const { hook, onGraded } = setup();
    act(() => hook.result.current.submit(1));
    expect(hook.result.current.phase).toBe('idle');
    expect(onGraded).not.toHaveBeenCalled();
  });

  it('replay goes back through playing; in feedback it keeps the phase', async () => {
    const { playback, hook, flush } = setup();
    act(() => hook.result.current.next());
    act(() => playback.finish());
    await flush();
    act(() => hook.result.current.replay());
    expect(hook.result.current.phase).toBe('playing');
    expect(playback.clips).toHaveLength(2);
    act(() => hook.result.current.submit(0));
    act(() => hook.result.current.replay());
    act(() => hook.result.current.playClip({ bpm: 60, steps: [] }));
    expect(hook.result.current.phase).toBe('feedback');
    expect(playback.clips).toHaveLength(4);
    act(() => playback.finish());
    await flush();
    expect(hook.result.current.phase).toBe('feedback');
  });

  it('a replaced clip does not advance the phase', async () => {
    const { playback, hook, flush } = setup();
    act(() => hook.result.current.next());
    act(() => hook.result.current.replay()); // cancels clip 1
    await flush();
    expect(hook.result.current.phase).toBe('playing');
    act(() => playback.finish());
    await flush();
    expect(hook.result.current.phase).toBe('answering');
  });

  it('stop silences and moves playing to answering', () => {
    const { hook } = setup();
    act(() => hook.result.current.next());
    act(() => hook.result.current.stop());
    expect(hook.result.current.phase).toBe('answering');
    expect(hook.result.current.sounding).toBe(false);
  });
});
