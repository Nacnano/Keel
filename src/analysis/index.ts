export {
  createAnalysisEngine,
  dwellSeconds,
  GAP_HOLD_SEC,
  NOTE_THRESHOLD,
  RELEASE_HOLD_SEC,
} from './engine';
export {
  CHORD_VOCAB,
  QUALITY_ORDER,
  buildTemplates,
  chordTones,
  qualitiesForLevel,
  sameChord,
  sameChordFamily,
} from './templates';
export type { ChordShape, TemplateBank } from './templates';
export { identifyExact, scoreChroma } from './chordScorer';
export type { ExactMatch } from './chordScorer';
export { createSmoother, lagForStability, stayProbability } from './smoother';
export type { Decoded, Smoother, SmootherOptions } from './smoother';
export { applyBass, createBassResolver } from './bassResolver';
export type { BassResolver } from './bassResolver';
export {
  KRUMHANSL_MAJOR,
  KRUMHANSL_MINOR,
  createKeyEstimator,
  relativeKey,
  DEFAULT_KEY_OPTIONS,
} from './keyEstimator';
export type { KeyEstimator, KeyEstimatorOptions } from './keyEstimator';
