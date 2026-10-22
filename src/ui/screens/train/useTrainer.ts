/**
 * Drill state machine shared by every ear-training drill:
 *
 *   idle --start--> playing --clip ends--> answering --submit--> feedback --next--> playing
 *
 * Answers are accepted while the clip is still playing (that cancels it). Replay from
 * `answering` goes back through `playing`; extra clips in `feedback` ("play correct",
 * "play yours") keep the phase. Score and streak are per screen visit; `onGraded` is where
 * the caller persists long-term stats.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Clip, PlayHandle, Playback } from './playback';

export type TrainerPhase = 'idle' | 'playing' | 'answering' | 'feedback';

export interface Graded {
  correct: boolean;
}

export interface TrainerOptions<Q, A, G extends Graded> {
  generate(): Q;
  clip(question: Q): Clip;
  grade(question: Q, answer: A): G;
  playback: Playback;
  onGraded?(grade: G, streak: number): void;
}

export interface TrainerState<Q, A, G extends Graded> {
  phase: TrainerPhase;
  question: Q | null;
  answer: A | null;
  grade: G | null;
  /** True once the current clip is audible (false while piano samples load). */
  sounding: boolean;
  score: { correct: number; total: number };
  streak: number;
  bestStreak: number;
}

export interface Trainer<Q, A, G extends Graded> extends TrainerState<Q, A, G> {
  /** New question and play it (idle / feedback). */
  next(): void;
  /** Play the current question again. */
  replay(): void;
  submit(answer: A): void;
  /** Play an arbitrary clip (e.g. the correct answer) without changing the phase. */
  playClip(clip: Clip): void;
  stop(): void;
}

export function useTrainer<Q, A, G extends Graded>(
  options: TrainerOptions<Q, A, G>,
): Trainer<Q, A, G> {
  const opts = useRef(options);
  // latest callbacks and settings, read by the event handlers below
  useLayoutEffect(() => {
    opts.current = options;
  });

  const [state, setState] = useState<TrainerState<Q, A, G>>({
    phase: 'idle',
    question: null,
    answer: null,
    grade: null,
    sounding: false,
    score: { correct: 0, total: 0 },
    streak: 0,
    bestStreak: 0,
  });
  const stateRef = useRef(state);
  const handle = useRef<PlayHandle | null>(null);
  const generation = useRef(0);

  const update = useCallback((patch: (s: TrainerState<Q, A, G>) => TrainerState<Q, A, G>) => {
    stateRef.current = patch(stateRef.current);
    setState(stateRef.current);
  }, []);

  const cancel = useCallback(() => {
    const h = handle.current;
    handle.current = null;
    generation.current += 1;
    h?.cancel();
  }, []);

  /** Play `clip`; when it ends on its own and nothing replaced it, run `onEnd`. */
  const sound = useCallback(
    (clip: Clip, onEnd?: () => void) => {
      cancel();
      update((s) => ({ ...s, sounding: false }));
      const token = ++generation.current;
      const h = opts.current.playback.play(clip, {
        // may fire synchronously, before `handle` is set
        onStart: () => {
          if (generation.current === token) update((s) => ({ ...s, sounding: true }));
        },
      });
      handle.current = h;
      void h.done.then(() => {
        if (handle.current !== h || generation.current !== token) return;
        handle.current = null;
        update((s) => ({ ...s, sounding: false }));
        onEnd?.();
      });
    },
    [cancel, update],
  );

  const toAnswering = useCallback(() => {
    update((s) => (s.phase === 'playing' ? { ...s, phase: 'answering' } : s));
  }, [update]);

  const playQuestion = useCallback(
    (q: Q) => {
      update((s) => ({ ...s, phase: 'playing' }));
      sound(opts.current.clip(q), toAnswering);
    },
    [sound, toAnswering, update],
  );

  const next = useCallback(() => {
    const q = opts.current.generate();
    update((s) => ({ ...s, question: q, answer: null, grade: null }));
    playQuestion(q);
  }, [playQuestion, update]);

  const replay = useCallback(() => {
    const { question, phase } = stateRef.current;
    if (question === null) return;
    if (phase === 'feedback') sound(opts.current.clip(question));
    else playQuestion(question);
  }, [playQuestion, sound]);

  const submit = useCallback(
    (answer: A) => {
      const s = stateRef.current;
      if (s.question === null || (s.phase !== 'playing' && s.phase !== 'answering')) return;
      cancel();
      const grade = opts.current.grade(s.question, answer);
      const streak = grade.correct ? s.streak + 1 : 0;
      update((st) => ({
        ...st,
        phase: 'feedback',
        answer,
        grade,
        sounding: false,
        score: {
          correct: st.score.correct + (grade.correct ? 1 : 0),
          total: st.score.total + 1,
        },
        streak,
        bestStreak: Math.max(st.bestStreak, streak),
      }));
      opts.current.onGraded?.(grade, streak);
    },
    [cancel, update],
  );

  const playClip = useCallback((clip: Clip) => sound(clip), [sound]);

  const stop = useCallback(() => {
    cancel();
    update((s) => ({
      ...s,
      sounding: false,
      phase: s.phase === 'playing' ? 'answering' : s.phase,
    }));
  }, [cancel, update]);

  useEffect(
    () => () => {
      cancel();
      opts.current.playback.stop();
    },
    [cancel],
  );

  return { ...state, next, replay, submit, playClip, stop };
}
