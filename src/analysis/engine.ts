/**
 * AnalysisEngine: ChromaFrame stream -> AnalysisEvent stream.
 *
 * mic frames:   scoreChroma -> fixed-lag Viterbi -> bass resolver -> `chord` (on change)
 * exact frames: identifyExact (no HMM, no lag)                     -> `chord` (on change)
 * all frames:   key estimator -> `key` (on change); `notes` (on change); `level` (every frame)
 */
import { DEFAULT_ANALYSIS_CONFIG, createEmitter } from '@/core';
import type {
  AnalysisConfig,
  AnalysisEngine,
  AnalysisEvent,
  Chord,
  ChromaFrame,
  InputSource,
  PitchClass,
} from '@/core';
import { applyBass, createBassResolver } from './bassResolver';
import { exactPitchClasses, identifyExact, scoreChroma } from './chordScorer';
import { createKeyEstimator } from './keyEstimator';
import { createSmoother } from './smoother';
import type { Smoother } from './smoother';
import { buildTemplates, sameChord } from './templates';
import type { TemplateBank } from './templates';

/** Chroma bins (L1-normalised) above this are reported in `notes` events for mic input. */
export const NOTE_THRESHOLD = 0.08;

const TIME_RING = 64;

export function createAnalysisEngine(config: Partial<AnalysisConfig> = {}): AnalysisEngine {
  let cfg: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
  const emitter = createEmitter<AnalysisEvent>();
  const keys = createKeyEstimator();
  const bass = createBassResolver();
  /** Frame times indexed by the smoother's own frame counter (mic frames only). */
  const times = new Float64Array(TIME_RING);

  let bank: TemplateBank = buildTemplates(cfg.vocabLevel);
  let sims = new Float32Array(bank.size + 1);
  let smoother: Smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });

  let lastDecodedFrame = -1;
  let lastChord: Chord | null = null;
  let lastNotes = '';

  function rebuild() {
    bank = buildTemplates(cfg.vocabLevel);
    sims = new Float32Array(bank.size + 1);
    smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });
    lastDecodedFrame = -1;
  }

  function emitChord(t: number, chord: Chord | null, confidence: number, source: InputSource) {
    if (sameChord(chord, lastChord)) return;
    lastChord = chord;
    emitter.emit({ type: 'chord', t, chord, confidence, source });
  }

  function emitNotes(t: number, pcs: PitchClass[]) {
    const sig = pcs.join(',');
    if (sig === lastNotes) return;
    lastNotes = sig;
    emitter.emit({ type: 'notes', t, pitchClasses: pcs });
  }

  function pushExact(frame: ChromaFrame) {
    const pcs = exactPitchClasses(frame.chroma);
    emitNotes(frame.t, pcs);
    const best = identifyExact(pcs, frame.bass, cfg.vocabLevel)[0];
    const chord = best ? applyBass(best.chord, best.chord.bass ?? null, cfg.showSlashChords) : null;
    emitChord(frame.t, chord, best ? Math.min(1, best.score) : 1, 'midi');
  }

  function pushMic(frame: ChromaFrame) {
    const silent = scoreChroma(frame.chroma, frame.energy, bank, sims);
    const pcs: PitchClass[] = [];
    if (!silent) {
      for (let b = 0; b < 12; b++) if (frame.chroma[b] > NOTE_THRESHOLD) pcs.push(b as PitchClass);
    }
    emitNotes(frame.t, pcs);
    bass.push(silent ? null : frame.bass);
    times[smoother.frames % TIME_RING] = frame.t;

    const decoded = smoother.push(sims);
    // A lag increase (stability change) can revisit frames that were already decided.
    if (!decoded || decoded.frame <= lastDecodedFrame) return;
    lastDecodedFrame = decoded.frame;
    const delay = smoother.frames - 1 - decoded.frame;
    const t = times[decoded.frame % TIME_RING];
    let chord: Chord | null = null;
    if (decoded.state < bank.size) {
      const raw: Chord = {
        root: bank.roots[decoded.state] as PitchClass,
        quality: bank.qualities[decoded.state],
      };
      chord = applyBass(raw, bass.stableAt(delay), cfg.showSlashChords);
    }
    emitChord(t, chord, decoded.confidence, 'mic');
  }

  return {
    configure(patch) {
      const prev = cfg;
      cfg = { ...cfg, ...patch };
      if (cfg.vocabLevel !== prev.vocabLevel) rebuild();
      else if (cfg.stability !== prev.stability) smoother.setStability(cfg.stability);
    },
    push(frame) {
      emitter.emit({ type: 'level', t: frame.t, energy: frame.energy });
      if (frame.exact) pushExact(frame);
      else pushMic(frame);
      const key = keys.push(frame);
      if (key) emitter.emit({ type: 'key', t: frame.t, key });
    },
    reset() {
      keys.reset();
      bass.reset();
      rebuild();
      lastChord = null;
      lastNotes = '';
    },
    subscribe: (cb) => emitter.subscribe(cb),
  };
}
