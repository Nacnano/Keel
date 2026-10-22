import { useState } from 'react';
import type { Key, KeyMode, PitchClass } from '@/core';
import {
  cadenceChords,
  gradeKey,
  keyName,
  prettyAccidentals,
  randomKeyQuestion,
  sameKey,
  tonicName,
} from '@/theory';
import type { KeyGrade, KeyQuestion } from '@/theory';
import { Button } from '@/ui/components/Button';
import { Segmented } from '@/ui/components/Segmented';
import { cx } from '@/ui/lib/cx';
import { chordsClip } from './playback';
import { Feedback, PlayControls } from './parts';
import type { DrillProps } from './parts';
import { ScoreBar } from './ScoreBar';
import { useTrainer } from './useTrainer';

/** Circle of fifths, C at the top. */
const FIFTHS: readonly PitchClass[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

const MODE_OPTIONS = [
  { value: 'major' as const, label: 'Major' },
  { value: 'minor' as const, label: 'Minor' },
];

const pretty = prettyAccidentals;
const shortName = (k: Key) => pretty(tonicName(k)) + (k.mode === 'minor' ? 'm' : '');

/** Hear a phrase that ends on a cadence, pick its key on the wheel. */
export function KeyDrill({ level, keys, bpm, playback, lifetime, onGraded, rng }: DrillProps) {
  const t = useTrainer<KeyQuestion, Key, KeyGrade>({
    generate: () => randomKeyQuestion({ rng: rng ?? Math.random, keys, level }),
    clip: (q) => chordsClip(q.chords, { bpm }),
    grade: gradeKey,
    playback,
    onGraded: (g, streak) => onGraded(g.correct, streak),
  });
  const { question: q, phase, answer, grade } = t;
  const feedback = phase === 'feedback' && q && grade;
  const [mode, setMode] = useState<KeyMode>('major');
  const minorAsked = keys.some((k) => k.mode === 'minor');

  const cadenceIn = (k: Key) => chordsClip(cadenceChords(k, level), { bpm, beats: 1 });

  return (
    <div className="flex flex-col gap-5">
      <ScoreBar score={t.score} streak={t.streak} lifetime={lifetime} />
      <PlayControls trainer={t} />
      {q && (
        <div className="flex flex-col items-center gap-4">
          <Segmented<KeyMode>
            aria-label="Key mode"
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
          <div
            role="group"
            aria-label="Key wheel"
            className="relative aspect-square w-full max-w-80"
          >
            {FIFTHS.map((tonic, i) => {
              const k: Key = { tonic, mode };
              const angle = (i / 12) * 2 * Math.PI;
              const right = feedback && sameKey(k, q.key);
              const wrong = feedback && answer && sameKey(k, answer) && !grade.correct;
              return (
                <button
                  key={tonic}
                  type="button"
                  aria-label={keyName(k)}
                  data-mark={right ? 'right' : wrong ? 'wrong' : undefined}
                  disabled={!!feedback}
                  onClick={() => t.submit(k)}
                  style={{
                    left: `${50 + 40 * Math.sin(angle)}%`,
                    top: `${50 - 40 * Math.cos(angle)}%`,
                  }}
                  className={cx(
                    'absolute flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full',
                    'text-sm font-semibold transition-colors duration-150 select-none',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300',
                    right
                      ? 'bg-emerald-500/25 text-emerald-100 ring-2 ring-emerald-400/70'
                      : wrong
                        ? 'bg-rose-500/25 text-rose-100 ring-2 ring-rose-400/70'
                        : 'bg-zinc-800/90 text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-700',
                  )}
                >
                  {shortName(k)}
                </button>
              );
            })}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-zinc-500">
              {feedback ? (
                <span className="text-base font-semibold text-white">{pretty(keyName(q.key))}</span>
              ) : (
                <span>
                  Tap the key
                  {minorAsked ? <br /> : null}
                  {minorAsked ? 'major or minor' : null}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {feedback && (
        <Feedback
          correct={grade.correct}
          title={
            grade.correct
              ? `Correct: ${pretty(keyName(q.key))}`
              : `It was ${pretty(keyName(q.key))}`
          }
          actions={
            <>
              <Button onClick={() => t.playClip(cadenceIn(q.key))}>Play correct</Button>
              {!grade.correct && answer && (
                <Button onClick={() => t.playClip(cadenceIn(answer))}>
                  Play yours ({shortName(answer)})
                </Button>
              )}
            </>
          }
        >
          <p>
            {pretty(q.numerals.join(' – '))}
            {!grade.correct && answer && (
              <>
                {' '}
                · you picked {pretty(keyName(answer))}
                {grade.relative &&
                  ', its relative key (same key signature; listen for where it lands)'}
                {grade.parallel && ', its parallel key (right tonic, other mode)'}
              </>
            )}
          </p>
        </Feedback>
      )}
    </div>
  );
}
