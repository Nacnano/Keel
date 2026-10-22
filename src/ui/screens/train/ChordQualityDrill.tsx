import { useCallback } from 'react';
import type { ChordQuality } from '@/core';
import {
  CHORD_TEMPLATES,
  chordSymbol,
  gradeChordQuality,
  prettyAccidentals,
  qualityName,
  randomChordQuestion,
} from '@/theory';
import type { ChordQuestion, QualityGrade } from '@/theory';
import { Button } from '@/ui/kit';
import { Piano } from '@/ui/components/Piano';
import { qualityClip, qualityNotes } from './playback';
import { Chip, Feedback, PlayControls } from './parts';
import type { DrillProps } from './parts';
import { ScoreBar } from './ScoreBar';
import { useTrainer } from './useTrainer';

/** Hear a chord, name its quality. */
export function ChordQualityDrill({ level, bpm, playback, lifetime, onGraded, rng }: DrillProps) {
  const t = useTrainer<ChordQuestion, ChordQuality, QualityGrade>({
    generate: () => randomChordQuestion(level, rng ?? Math.random),
    clip: (q) => qualityClip(q.chord, bpm),
    grade: gradeChordQuality,
    playback,
    onGraded: (g, streak) => onGraded(g.correct, streak),
  });
  const { question: q, phase, answer, grade } = t;
  const feedback = phase === 'feedback' && q && grade;
  const choices = q?.choices ?? [];

  const playQuality = useCallback(
    (quality: ChordQuality) => q && t.playClip(qualityClip({ root: q.chord.root, quality }, bpm)),
    [q, t, bpm],
  );

  return (
    <div className="flex flex-col gap-6">
      <PlayControls trainer={t} prompt="What kind of chord is this?" />
      {q && (
        <div
          role="group"
          aria-label="Chord quality"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {choices.map((quality) => {
            const right = feedback && quality === q.chord.quality;
            const wrong = feedback && quality === answer && !grade.correct;
            const suffix = CHORD_TEMPLATES[quality].symbol;
            return (
              <Chip
                key={quality}
                label={qualityName(quality)}
                onClick={() => (feedback ? playQuality(quality) : t.submit(quality))}
                mark={right ? 'right' : wrong ? 'wrong' : null}
              >
                <span>{qualityName(quality)}</span>
                {suffix && (
                  <span aria-hidden className="text-subhead font-normal text-label-2">
                    {prettyAccidentals(suffix)}
                  </span>
                )}
              </Chip>
            );
          })}
        </div>
      )}
      {feedback && (
        <Feedback
          correct={grade.correct}
          title={
            grade.correct
              ? `Correct: ${qualityName(q.chord.quality)}`
              : `It was ${qualityName(q.chord.quality)}`
          }
          actions={
            <>
              <Button variant="plain" onClick={() => t.playClip(qualityClip(q.chord, bpm))}>
                Play correct
              </Button>
              {!grade.correct && answer && (
                <Button variant="plain" onClick={() => playQuality(answer)}>
                  Play yours ({qualityName(answer)})
                </Button>
              )}
            </>
          }
        >
          <p>
            <span className="font-semibold text-label">
              {prettyAccidentals(chordSymbol(q.chord))}
            </span>
            {!grade.correct && answer && <> · you picked {qualityName(answer)}</>}
            <span className="text-label-3"> · tap any answer to hear it on this root</span>
          </p>
          <Piano
            range={[36, 96]}
            activeMidiNotes={qualityNotes(q.chord)}
            ariaLabel={`Piano, ${chordSymbol(q.chord)}`}
            className="mt-3 max-h-28"
          />
        </Feedback>
      )}
      <ScoreBar score={t.score} streak={t.streak} lifetime={lifetime} />
    </div>
  );
}
