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
import { Button } from '@/ui/kit';
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
    <div className="flex flex-col gap-6">
      <PlayControls trainer={t} prompt="Which numerals do you hear?" />
      {q && (
        <>
          <p className="-mt-3 text-center text-subhead text-label-2">
            In <span className="font-semibold text-label">{pretty(keyName(q.key))}</span>
            <span className="text-label-3"> · a cadence sets the key first</span>
          </p>
          <ol
            aria-label="Progression slots"
            className="grid grid-cols-4 gap-0.5 rounded-[12px] bg-fill-3 p-0.5"
          >
            {slots.map((s, i) => {
              const mark = feedback ? (grade.slots[i] ? 'right' : 'wrong') : null;
              const current = !feedback && i === active;
              return (
                <li key={i}>
                  <button
                    type="button"
                    aria-label={`Chord ${i + 1}: ${s ?? 'empty'}`}
                    aria-current={current ? 'true' : undefined}
                    data-mark={mark ?? undefined}
                    disabled={!!feedback}
                    onClick={() => setActive(i)}
                    className={cx(
                      'flex min-h-18 w-full flex-col items-center justify-center rounded-[10px] text-title-2 font-semibold',
                      'transition-[background-color,color,box-shadow] duration-150',
                      current &&
                        'bg-surface-2 shadow-[0_1px_3px_rgba(0,0,0,0.25),0_0_0_0.5px_rgba(0,0,0,0.06)] dark:bg-[#636366]',
                      mark === 'right' && 'bg-ok/15 text-ok',
                      mark === 'wrong' && 'bg-live/15 text-live',
                      !mark && (s ? 'text-label' : 'text-label-3'),
                    )}
                  >
                    <span>{s ? pretty(s) : '?'}</span>
                    {feedback && (
                      <span className="mt-0.5 text-caption font-medium text-label-2">
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
              <div role="group" aria-label="Numerals" className="grid grid-cols-4 gap-2">
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
              <div className="flex justify-center gap-2">
                <Button
                  variant="tinted"
                  className="min-w-32"
                  disabled={!filled}
                  onClick={() => t.submit(slots)}
                >
                  Check
                </Button>
                <Button
                  variant="plain"
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
              <Button variant="plain" onClick={() => t.playClip(chordsClip(q.chords, { bpm }))}>
                Play correct
              </Button>
              {!grade.correct && yours && (
                <Button variant="plain" onClick={() => t.playClip(chordsClip(yours, { bpm }))}>
                  Play yours
                </Button>
              )}
            </>
          }
        >
          <p>
            {q.numerals.map(pretty).join(' – ')}{' '}
            <span className="text-label-3">
              ({q.chords.map((c) => pretty(chordSymbol(c, q.key))).join(' ')})
            </span>
          </p>
        </Feedback>
      )}
      <ScoreBar score={t.score} streak={t.streak} lifetime={lifetime} />
    </div>
  );
}
