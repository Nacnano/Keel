/**
 * AnalysisEngine: ChromaFrame stream -> AnalysisEvent stream.
 *
 * mic frames:   scoreChroma -> fixed-lag Viterbi -> bass resolver -> dwell gate -> `chord`
 * exact frames: identifyExact (no HMM, no lag)                     -> `chord` (on change)
 * all frames:   key estimator -> `key` (on change); `notes` (on change); `level` (every frame)
 */
import { DEFAULT_ANALYSIS_CONFIG, MIN_DISPLAY_CONFIDENCE, createEmitter } from '@/core';
import type {
  AnalysisConfig,
  JamMode,
  AnalysisEngine,
  AnalysisEvent,
  Chord,
  ChromaFrame,
  InputSource,
  Key,
  PitchClass,
  VocabLevel,
} from '@/core';
import { chordFamily, isDiatonic } from '@/theory';
import { applyBass, createBassResolver } from './bassResolver';
import { exactPitchClasses, identifyExact, scoreChroma } from './chordScorer';
import { createKeyEstimator } from './keyEstimator';
import { createSmoother } from './smoother';
import type { Smoother } from './smoother';
import { buildTemplates, sameChordFamily } from './templates';
import type { TemplateBank } from './templates';

/** Chroma bins (L1-normalised) above this are reported in `notes` events for mic input. */
export const NOTE_THRESHOLD = 0.08;

/**
 * Mic frames that are silent (gate closed) less than this long after sound keep the last
 * chord: a decaying chord that sinks into the room noise, or a breath between phrases, is
 * still the chord being played. Longer silences decode as no-chord.
 */
export const RELEASE_HOLD_SEC = 2;

/**
 * While there is sound, a stretch the decoder cannot name confidently (no-chord state, or a
 * posterior below MIN_DISPLAY_CONFIDENCE) keeps the last chord on screen for up to this long:
 * drums, a sung line or a fill between two chords is no reason to blank the display.
 */
export const GAP_HOLD_SEC = 2;

/** Extra dwell in room mode ("With a band"): one mode choice also picks the steadier display. */
export const ROOM_EXTRA_DWELL_SEC = 0.15;

/**
 * A change that keeps the root (C → Csus4, C → Cmaj7, Dm → Dm7) needs this many times the
 * dwell: a sus or a passing seventh over a held chord is usually voice leading, not new harmony.
 */
export const SAME_ROOT_DWELL = 2;

/**
 * Minimum dwell (seconds) before the mic path shows a new chord: the decoded chord has to hold
 * this long, the smoother's look-ahead included, so passing bass notes, melody notes and fills
 * do not flip the display. 0.45 s at the default stability 0.5 in solo mode, 0.6 s in room mode
 * (0.25..0.65 s solo and 0.4..0.8 s room across the stability range).
 */
export function dwellSeconds(stability: number, mode: JamMode): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(stability) ? stability : 0.5));
  return 0.25 + 0.4 * s + (mode === 'room' ? ROOM_EXTRA_DWELL_SEC : 0);
}

/**
 * A decoded chord is only shown when the best path stays in it for at least this many frames
 * of the look-ahead window; shorter runs are transition blips (C → C/G → G).
 */
export const MIN_RUN = 3;

const TIME_RING = 64;

/**
 * Room mode ("With a band") names triads only (vocabulary level 1: major, minor, diminished),
 * whatever the chord-detail level: sevenths and sus chords over a band are mostly the other
 * instruments' notes.
 */
export const ROOM_VOCAB_LEVEL: VocabLevel = 1;

/**
 * Room mode: similarity bonus for chords that belong to the current key, so that when two
 * chords score about the same the in-key one wins (C, not Cm, in a plain C-major song).
 */
export const ROOM_IN_KEY_BONUS = 0.03;

/** The vocabulary level the engine decodes with for a config. */
export function effectiveVocabLevel(cfg: Pick<AnalysisConfig, 'vocabLevel' | 'mode'>): VocabLevel {
  return cfg.mode === 'room'
    ? (Math.min(cfg.vocabLevel, ROOM_VOCAB_LEVEL) as VocabLevel)
    : cfg.vocabLevel;
}

/** In the key's scale, or (minor keys) in harmonic minor: V and vii° count as in key. */
function inKey(chord: Chord, key: Key): boolean {
  return isDiatonic(chord, key) || (key.mode === 'minor' && isDiatonic(chord, key, 'harmonic'));
}

/**
 * Reading of a detected (mic) chord in the current key, for the chords a chroma template
 * confuses with their neighbours:
 * - minor key: a diminished triad (or m7♭5) on the tonic is the tonic minor chord with a
 *   blurred fifth (Ddim → Dm in D minor), and the diminished triad on scale degree 2 is the
 *   half-diminished ii of a minor ii-V (Edim → Em7♭5) when the vocabulary has sevenths;
 * - major key: a minor chord on the tonic is the tonic with a blue (or passing) third: Cm → C,
 *   and Cm7 → C7 (the blue third over a ♭7 is the blues I7) when the vocabulary has sevenths;
 * - major-key blues (`blues`): the tonic triad is the I7 (C → C7) when the vocabulary has
 *   sevenths: the ♭7 of a blues tonic is often in the left hand's shell, too quiet to score.
 * Exact (MIDI) chords are never re-read: what was played is what is shown.
 */
export function keyReading(chord: Chord, key: Key | null, level: VocabLevel, blues = false): Chord {
  if (!key) return chord;
  const degree = (chord.root - key.tonic + 12) % 12;
  const family = chordFamily(chord.quality);
  if (key.mode === 'minor') {
    if (degree === 0 && chord.quality === 'dim') return { ...chord, quality: 'min' };
    if (degree === 0 && chord.quality === 'm7b5')
      return { ...chord, quality: level >= 2 ? 'min7' : 'min' };
    if (degree === 2 && chord.quality === 'dim' && level >= 2) return { ...chord, quality: 'm7b5' };
    return chord;
  }
  if (degree === 0 && (family === 'min' || family === 'maj') && blues && level >= 2)
    return { ...chord, quality: '7' };
  if (degree === 0 && family === 'min') return { ...chord, quality: 'maj' };
  if (degree === 0 && family === 'min7') return { ...chord, quality: level >= 2 ? '7' : 'maj' };
  return chord;
}

export function createAnalysisEngine(config: Partial<AnalysisConfig> = {}): AnalysisEngine {
  let cfg: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
  const emitter = createEmitter<AnalysisEvent>();
  const keys = createKeyEstimator();
  const bass = createBassResolver();
  /** Frame times indexed by the smoother's own frame counter (mic frames only). */
  const times = new Float64Array(TIME_RING);

  let level: VocabLevel = effectiveVocabLevel(cfg);
  let bank: TemplateBank = buildTemplates(level);
  let sims = new Float32Array(bank.size + 1);
  let smoother: Smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });

  let lastDecodedFrame = -1;
  /** Last chord shown, and the heard chord it was read from. */
  let lastChord: Chord | null = null;
  let lastHeard: Chord | null = null;
  let lastNotes = '';
  let heldSims: Float32Array | null = null;
  let prevBass: PitchClass | null = null;
  let lastSoundT = -Infinity;
  /** Per smoother frame: 1 when the gate has been closed for longer than the release hold. */
  const quiet = new Uint8Array(TIME_RING);
  /** A confidently decoded chord waiting for its dwell before it replaces `lastChord`. */
  let pending: { chord: Chord; t0: number; confidence: number } | null = null;
  /** Decoded-frame time of the last confident chord. */
  let lastSureT = -Infinity;
  /** Current key (as last emitted), and the room-mode in-key bonus per template. */
  let key: Key | null = null;
  let inKeyBonus: Float32Array | null = null;
  /** Time of the last key event, so a backdated change never goes before it. */
  let lastKeyT = -Infinity;
  let lastSource: InputSource = 'mic';
  let lastConfidence = 0;

  function updateInKey() {
    if (cfg.mode !== 'room' || !key) {
      inKeyBonus = null;
      return;
    }
    const k = key;
    inKeyBonus = new Float32Array(bank.size);
    for (let i = 0; i < bank.size; i++) {
      const chord: Chord = { root: bank.roots[i] as PitchClass, quality: bank.qualities[i] };
      if (inKey(chord, k)) inKeyBonus[i] = ROOM_IN_KEY_BONUS;
    }
  }

  function rebuild() {
    level = effectiveVocabLevel(cfg);
    bank = buildTemplates(level);
    sims = new Float32Array(bank.size + 1);
    smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });
    lastDecodedFrame = -1;
    heldSims = null;
    pending = null;
    updateInKey();
  }

  /** The chord shown for a heard chord: mic chords are read in the current key. */
  function shownFor(heard: Chord | null, source: InputSource): Chord | null {
    return heard && source === 'mic' ? keyReading(heard, key, level, keys.blues()) : heard;
  }

  /**
   * A heard chord passed the dwell gate. The key estimator sees what was heard (so a Dm under a
   * provisional D-major key still counts as Dm); the display shows the key reading of it, and
   * only on a real change: a new bass note or added tone over the same chord is not one.
   */
  function emitChord(t: number, heard: Chord | null, confidence: number, source: InputSource) {
    if (sameChordFamily(heard, lastHeard)) return;
    lastHeard = heard;
    lastSource = source;
    lastConfidence = confidence;
    keys.observeChord(t, heard && confidence >= MIN_DISPLAY_CONFIDENCE ? heard : null);
    showChord(t, shownFor(heard, source), confidence, source);
  }

  function showChord(t: number, chord: Chord | null, confidence: number, source: InputSource) {
    if (sameChordFamily(chord, lastChord)) return;
    lastChord = chord;
    emitter.emit({ type: 'chord', t, chord, confidence, source });
  }

  /**
   * Dwell gate for one decoded mic frame at time `t`, whose state the best path keeps until
   * `tEnd` (look-ahead included). A confident new chord replaces the shown one once it has held
   * for `dwellSeconds`; frames that cannot be named confidently are no evidence either way. The
   * display only goes blank after GAP_HOLD_SEC without a confident chord, or once the input
   * has been silent for longer than the release hold.
   */
  function gate(t: number, tEnd: number, chord: Chord | null, confidence: number, silent: boolean) {
    const dwell = dwellSeconds(cfg.stability, cfg.mode);
    if (chord && confidence >= MIN_DISPLAY_CONFIDENCE) {
      lastSureT = t;
      if (sameChordFamily(chord, lastHeard)) {
        pending = null;
        return;
      }
      if (!pending || !sameChordFamily(pending.chord, chord))
        pending = { chord, t0: t, confidence };
      pending.confidence = Math.max(pending.confidence, confidence);
      const need = lastHeard && lastHeard.root === chord.root ? dwell * SAME_ROOT_DWELL : dwell;
      if (tEnd - pending.t0 + 1e-6 >= need) {
        emitChord(pending.t0, pending.chord, pending.confidence, 'mic');
        pending = null;
      }
      return;
    }
    if (!lastHeard) return;
    // Released silence has already waited RELEASE_HOLD_SEC; a gap with sound waits GAP_HOLD_SEC.
    if (silent || tEnd - lastSureT + 1e-6 >= GAP_HOLD_SEC) {
      emitChord(silent ? t : lastSureT, null, confidence, 'mic');
      pending = null;
    }
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
    const best = identifyExact(pcs, frame.bass, level)[0];
    const chord = best ? applyBass(best.chord, best.chord.bass ?? null, cfg.showSlashChords) : null;
    emitChord(frame.t, chord, best ? Math.min(1, best.score) : 1, 'midi');
  }

  function pushMic(frame: ChromaFrame) {
    // The bass only counts for scoring once it repeats (one-frame bass blips are common at
    // attacks and in arpeggios).
    const stableBass = frame.bass !== null && frame.bass === prevBass ? frame.bass : null;
    prevBass = frame.bass;
    const silent = scoreChroma(frame.chroma, frame.energy, bank, sims, stableBass, {
      majorTonic: key?.mode === 'major' ? key.tonic : null,
    });
    if (!silent && inKeyBonus) for (let i = 0; i < bank.size; i++) sims[i] += inKeyBonus[i];
    if (!silent) {
      lastSoundT = frame.t;
      heldSims = Float32Array.from(sims);
    } else if (heldSims && frame.t - lastSoundT < RELEASE_HOLD_SEC) {
      sims.set(heldSims);
    }
    quiet[smoother.frames % TIME_RING] = silent && frame.t - lastSoundT >= RELEASE_HOLD_SEC ? 1 : 0;
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
    // Transition blip: the best path only passes through this state for a frame or two on its
    // way to another one (C → C/G → G). Keep showing the current chord instead.
    if (decoded.run < MIN_RUN && decoded.run <= smoother.lag) return;
    const delay = smoother.frames - 1 - decoded.frame;
    const t = times[decoded.frame % TIME_RING];
    const tEnd = times[(decoded.frame + decoded.run - 1) % TIME_RING];
    let chord: Chord | null = null;
    if (decoded.state < bank.size) {
      const heard: Chord = {
        root: bank.roots[decoded.state] as PitchClass,
        quality: bank.qualities[decoded.state],
      };
      chord = applyBass(heard, bass.stableAt(delay), cfg.showSlashChords);
    }
    gate(t, tEnd, chord, decoded.confidence, quiet[decoded.frame % TIME_RING] === 1);
  }

  return {
    configure(patch) {
      const prev = cfg;
      cfg = { ...cfg, ...patch };
      if (effectiveVocabLevel(cfg) !== level) rebuild();
      else {
        if (cfg.stability !== prev.stability) smoother.setStability(cfg.stability);
        if (cfg.mode !== prev.mode) updateInKey();
      }
    },
    push(frame) {
      emitter.emit({ type: 'level', t: frame.t, energy: frame.energy });
      if (frame.exact) pushExact(frame);
      else pushMic(frame);
      const next = keys.push(frame);
      if (next) {
        key = { tonic: next.tonic, mode: next.mode };
        updateInKey();
        // The key is drawn from where its evidence started, so the chords that led to it are
        // spelled and numbered in it (never before the previous key event, never in the future).
        const t = Math.min(frame.t, Math.max(lastKeyT, keys.since() ?? frame.t));
        lastKeyT = t;
        emitter.emit({ type: 'key', t, key: next });
        // The chord on screen is re-read in the new key (the first chord, heard before the key,
        // is a Cm that the key C major reads as C).
        if (lastHeard)
          showChord(frame.t, shownFor(lastHeard, lastSource), lastConfidence, lastSource);
      }
    },
    resetKey() {
      keys.reset();
      key = null;
      lastKeyT = -Infinity;
      updateInKey();
    },
    reset() {
      keys.reset();
      key = null;
      lastKeyT = -Infinity;
      inKeyBonus = null;
      bass.reset();
      rebuild();
      lastChord = null;
      lastHeard = null;
      lastSureT = -Infinity;
      lastNotes = '';
      lastSoundT = -Infinity;
      prevBass = null;
    },
    subscribe: (cb) => emitter.subscribe(cb),
  };
}
