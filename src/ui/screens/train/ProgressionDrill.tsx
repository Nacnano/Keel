import { useState } from 'react';
import type { Chord } from '@/core';
import {
  chordForNumeral,
  chordSymbol,
  gradeProgression,
  keyName,
  prettyAccidentals,
  randomProgressionQuestion,
} from '@/theory';
import type { ProgressionGrade, ProgressionQuestion } from '@/theory';
import { Button } from '@/ui/components/Button';
import { cx } from '@/ui/lib/cx';
import { chordsClip } from './playback';
import { Chip, Feedback, PlayControls } from './parts';
import type { DrillProps } from './parts';
import { ScoreBar } from './ScoreBar';
import { useTrainer } from './useTrainer';

const LENGTH = 4;
type Slots = (string | null)[];

const pretty = prettyAccidentals;

/** Hear a cadence and a four-chord progression, pick a numeral for each slot. */
export function ProgressionDrill({
  level,
  keys,
  bpm,
  playback,
  lifetime,
  onGraded,
  rng,
}: DrillProps) {
  const t = useTrainer<ProgressionQuestion, Slots, ProgressionGrade>({
    generate: () =>
      randomProgressionQuestion({ rng: rng ?? Math.random, level, keys, length: LENGTH }),
    clip: (q) => chordsClip(q.chords, { bpm, cadence: { key: q.key, level } }),
    grade: gradeProgression,
    playback,
    onGraded: (g, streak) => onGraded(g.correct, streak),
  });
  const { question: q, phase, grade } = t;
  const feedback = phase === 'feedback' && q && grade;

  const [slots, setSlots] = useState<Slots>(() => Array(LENGTH).fill(null));
  const [active, setActive] = useState(0);
  // new question: clear the answer (state adjusted during render, no effect pass)
  const [answerFor, setAnswerFor] = useState(q);
  if (answerFor !== q) {
    setAnswerFor(q);
    setSlots(Array(LENGTH).fill(null));
    setActive(0);
  }

  const pickNumeral = (numeral: string) => {
    const next = slots.slice();
    next[active] = numeral;
    setSlots(next);
    const empty = next.findIndex((s, i) => s === null && i > active);
    const firstEmpty = empty >= 0 ? empty : next.indexOf(null);
    setActive(firstEmpty >= 0 ? firstEmpty : active);
  };

  const filled = slots.every((s) => s !== null);
  const yours: Chord[] | null =
    q && filled ? slots.map((n) => chordForNumeral(q, n!)!).filter(Boolean) : null;

  return (
    <div className="flex flex-col gap-5">
      <ScoreBar score={t.score} streak={t.streak} lifetime={lifetime} />
      <PlayControls trainer={t} />
      {q && (
        <>
          <p className="text-sm text-zinc-400">
            Key: <span className="font-semibold text-white">{pretty(keyName(q.key))}</span>
            <span className="text-zinc-500"> · a cadence sets the key, then the progression</span>
          </p>
          <ol aria-label="Progression slots" className="grid grid-cols-4 gap-2">
            {slots.map((s, i) => {
              const mark = feedback ? (grade.slots[i] ? 'right' : 'wrong') : null;
              return (
                <li key={i}>
                  <button
                    type="button"
                    aria-label={`Chord ${i + 1}: ${s ?? 'empty'}`}
                    aria-current={!feedback && i === active ? 'true' : undefined}
                    disabled={!!feedback}
                    onClick={() => setActive(i)}
                    className={cx(
                      'flex min-h-20 w-full flex-col items-center justify-center rounded-2xl text-xl font-semibold',
                      'ring-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-violet-300',
                      mark === 'right' && 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/50',
                      mark === 'wrong' && 'bg-rose-500/15 text-rose-100 ring-rose-400/50',
                      !mark &&
                        (i === active
                          ? 'bg-violet-400/10 text-white ring-violet-300/70'
                          : 'bg-zinc-900 text-zinc-100 ring-zinc-800'),
                    )}
                  >
                    <span>{s ? pretty(s) : '?'}</span>
                    {feedback && (
                      <span className="mt-1 text-xs font-medium text-zinc-300">
                        {pretty(q.numerals[i])} · {pretty(chordSymbol(q.chords[i], q.key))}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
          {!feedback && (
            <>
              <div
                role="group"
                aria-label="Numerals"
                className="grid grid-cols-4 gap-2 sm:grid-cols-8"
              >
                {q.choices.map((c) => (
                  <Chip
                    key={c.numeral}
                    label={c.numeral}
                    onClick={() => pickNumeral(c.numeral)}
                    selected={slots[active] === c.numeral}
                  >
                    {pretty(c.numeral)}
                  </Chip>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" disabled={!filled} onClick={() => t.submit(slots)}>
                  Check
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSlots(Array(LENGTH).fill(null));
                    setActive(0);
                  }}
                >
                  Clear
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {feedback && (
        <Feedback
          correct={grade.correct}
          title={
            grade.correct
              ? 'Correct: every chord'
              : `${grade.slots.filter(Boolean).length} of ${LENGTH} right`
          }
          actions={
            <>
              <Button onClick={() => t.playClip(chordsClip(q.chords, { bpm }))}>
                Play correct
              </Button>
              {!grade.correct && yours && (
                <Button onClick={() => t.playClip(chordsClip(yours, { bpm }))}>Play yours</Button>
              )}
            </>
          }
        >
          <p>
            {q.numerals.map(pretty).join(' – ')}{' '}
            <span className="text-zinc-500">
              ({q.chords.map((c) => pretty(chordSymbol(c, q.key))).join(' ')})
            </span>
          </p>
        </Feedback>
      )}
    </div>
  );
}
