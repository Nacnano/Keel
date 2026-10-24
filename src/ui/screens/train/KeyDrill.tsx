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
import { Button, Segmented } from '@/ui/kit';
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
    <div className="flex flex-col gap-6">
      <PlayControls trainer={t} prompt="Which key is this in?" />
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
                    'text-subhead font-semibold transition-[background-color,color,transform] duration-150 select-none',
                    'active:scale-95 disabled:cursor-default',
                    right
                      ? 'bg-ok text-white'
                      : wrong
                        ? 'bg-danger-action text-white'
                        : feedback
                          ? 'bg-fill-4 text-label-3'
                          : 'bg-fill-3 text-label hover:bg-accent/15 hover:text-accent active:bg-action active:text-accent-fg',
                  )}
                >
                  {shortName(k)}
                </button>
              );
            })}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-[22%] rounded-full ring-1 ring-separator"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-footnote text-label-2">
              {feedback ? (
                <span className="text-headline font-semibold text-label">
                  {pretty(keyName(q.key))}
                </span>
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
              <Button variant="plain" onClick={() => t.playClip(cadenceIn(q.key))}>
                Play correct
              </Button>
              {!grade.correct && answer && (
                <Button variant="plain" onClick={() => t.playClip(cadenceIn(answer))}>
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
      <ScoreBar score={t.score} streak={t.streak} lifetime={lifetime} />
    </div>
  );
}
