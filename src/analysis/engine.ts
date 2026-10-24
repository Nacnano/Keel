/**
 * AnalysisEngine: ChromaFrame stream -> AnalysisEvent stream.
 *
 * mic frames:   scoreChroma -> fixed-lag Viterbi -> bass resolver -> dwell gate -> `chord`
 * exact frames: identifyExact (no HMM, no lag)                     -> `chord` (on change)
 * all frames:   key estimator -> key publisher -> `key` (confirmed keys, see keyPublisher.ts);
 *               `notes` (on change); `level` (every frame)
 *
 * Chords are read in the published key, or before it is confirmed in the estimator's current
 * key (so the first chords are already read, and the in-key preference works, while the
 * screen still says "Finding the key").
 */
import { DEFAULT_ANALYSIS_CONFIG, MIN_DISPLAY_CONFIDENCE, createEmitter } from '@/core';
import type {
  AnalysisConfig,
  JamMode,
  AnalysisEngine,
  AnalysisEvent,
  Chord,
  ChordQuality,
  ChromaFrame,
  InputSource,
  Key,
  KeyEvent,
  PitchClass,
  VocabLevel,
} from '@/core';
import { chordFamily, isDiatonic, mod12, sameKey, scaleOf } from '@/theory';
import { applyBass, createBassResolver } from './bassResolver';
import { exactPitchClasses, identifyExact, scoreChroma } from './chordScorer';
import { createKeyEstimator } from './keyEstimator';
import { createKeyPublisher } from './keyPublisher';
import { createSmoother } from './smoother';
import { createNoteTracker } from './noteTracker';
import type { Smoother } from './smoother';
import { CHORD_VOCAB, buildTemplates, sameChordFamily } from './templates';
import type { TemplateBank } from './templates';

export { NOTE_THRESHOLD } from './noteTracker';

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
 * Room mode ("With a band") names major and minor triads only (vocabulary level 1 without the
 * diminished triad, `ROOM_QUALITIES`), whatever the chord-detail level: sevenths, sus chords
 * and a diminished reading over a band are mostly the other instruments' notes (C♯dim over a
 * band in E is C♯m with its fifth lost in the mix).
 */
export const ROOM_VOCAB_LEVEL: VocabLevel = 1;
export const ROOM_QUALITIES: readonly ChordQuality[] = ['maj', 'min'];

/**
 * Similarity bonus for chords that belong to the current key, so that when two chords score
 * about the same the in-key one wins (C, not Cm, in a plain C-major song; Am, not A7, in G).
 * Room mode (triads, a band's notes on top) leans on it a little more than Just me.
 */
export const ROOM_IN_KEY_BONUS = 0.03;
export const SOLO_IN_KEY_BONUS = 0.03;

/**
 * Room mode: a chord outside the key has to hold this long (seconds) before it is shown: a
 * band's passing chords and melody notes make short out-of-key triads that nobody played.
 */
export const OUT_OF_KEY_HOLD_SEC = 2;

/** The vocabulary level the engine decodes with for a config. */
export function effectiveVocabLevel(cfg: Pick<AnalysisConfig, 'vocabLevel' | 'mode'>): VocabLevel {
  return cfg.mode === 'room'
    ? (Math.min(cfg.vocabLevel, ROOM_VOCAB_LEVEL) as VocabLevel)
    : cfg.vocabLevel;
}

/**
 * In the key's scale, or (minor keys) in harmonic minor: V and vii° count as in key. With
 * `dominant` (a major key whose tonic sounds as a dominant seventh: the blues) the ♭3 and ♭7
 * count as in key too, so C7, F7 and B♭ fit a C blues.
 */
export function inKey(chord: Chord, key: Key, dominant = false): boolean {
  if (isDiatonic(chord, key) || (key.mode === 'minor' && isDiatonic(chord, key, 'harmonic')))
    return true;
  if (!dominant || key.mode !== 'major') return false;
  const scale = new Set<number>([...scaleOf(key), mod12(key.tonic + 3), mod12(key.tonic + 10)]);
  const tones = CHORD_VOCAB[chord.quality].intervals.map((i) => mod12(chord.root + i));
  if (chord.bass !== undefined) tones.push(chord.bass);
  return tones.every((p) => scale.has(p));
}

/**
 * Room mode: the major or minor triad a diminished triad stands for (the exact path, where a
 * player's notes are named as played otherwise): the minor chord on its root when that is in
 * the key (C♯dim → C♯m in E), else the in-key chord it is the top of (Bdim → G in C, the V7
 * without its root) or the bottom of (F♯dim → Am in C), else the minor chord on its root.
 */
export function bandTriad(chord: Chord, key: Key | null): Chord {
  if (chord.quality !== 'dim') return chord;
  const { bass: _bass, ...plain } = chord;
  const minor: Chord = { ...plain, quality: 'min' };
  if (!key || inKey(minor, key)) return minor;
  const options: Chord[] = [
    { root: mod12(chord.root - 4), quality: 'maj' },
    { root: mod12(chord.root + 3), quality: 'min' },
  ];
  return options.find((c) => inKey(c, key)) ?? minor;
}

/**
 * A diminished seventh is four minor thirds, so any of its tones can be its root: name it from
 * the key's leading tone when that is one of them (E–G–B♭–C♯ in D minor is C♯dim7, vii°7).
 */
export function dim7Root(chord: Chord, key: Key | null): Chord {
  if (chord.quality !== 'dim7' || !key) return chord;
  const leading = mod12(key.tonic - 1);
  if (leading === chord.root || mod12(leading - chord.root) % 3 !== 0) return chord;
  return { ...chord, root: leading };
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
 *   sevenths: the ♭7 of a blues tonic is often in the left hand's shell, too quiet to score;
 * - any key: a diminished seventh is named from the key's leading tone (`dim7Root`).
 * Exact (MIDI) chords are never re-read: what was played is what is shown.
 */
export function keyReading(chord: Chord, key: Key | null, level: VocabLevel, blues = false): Chord {
  if (!key) return chord;
  if (chord.quality === 'dim7') return dim7Root(chord, key);
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
  const publisher = createKeyPublisher();
  const bass = createBassResolver();
  const micNotes = createNoteTracker();
  /** Frame times indexed by the smoother's own frame counter (mic frames only). */
  const times = new Float64Array(TIME_RING);

  let level: VocabLevel = effectiveVocabLevel(cfg);
  const bankFor = (c: AnalysisConfig) =>
    buildTemplates(effectiveVocabLevel(c), c.mode === 'room' ? ROOM_QUALITIES : undefined);
  let bank: TemplateBank = bankFor(cfg);
  let sims = new Float32Array(bank.size + 1);
  let smoother: Smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });

  let lastDecodedFrame = -1;
  /** Last chord shown, and the heard chord it was read from. */
  let lastChord: Chord | null = null;
  let lastHeard: Chord | null = null;
  let lastHeardT = 0;
  let lastNotes = '';
  let prevBass: PitchClass | null = null;
  let lastSoundT = -Infinity;
  /** Per smoother frame: 1 when the gate has been closed for longer than the release hold. */
  const quiet = new Uint8Array(TIME_RING);
  /** A confidently decoded chord waiting for its dwell before it replaces `lastChord`. */
  let pending: { chord: Chord; t0: number; confidence: number } | null = null;
  /** Decoded-frame time of the last confident chord. */
  let lastSureT = -Infinity;
  /**
   * Key the chords are read in (the published key, else the estimate being confirmed), whether
   * it is a dominant tonality (♭3 / ♭7 in key), and the in-key bonus per template.
   */
  let key: Key | null = null;
  let dominant = false;
  let inKeyBonus: Float32Array | null = null;
  let lastSource: InputSource = 'mic';
  let lastConfidence = 0;

  function updateInKey() {
    if (!key) {
      inKeyBonus = null;
      return;
    }
    const k = key;
    const bonus = cfg.mode === 'room' ? ROOM_IN_KEY_BONUS : SOLO_IN_KEY_BONUS;
    inKeyBonus = new Float32Array(bank.size);
    for (let i = 0; i < bank.size; i++) {
      const chord: Chord = { root: bank.roots[i] as PitchClass, quality: bank.qualities[i] };
      if (inKey(chord, k, dominant)) inKeyBonus[i] = bonus;
    }
  }

  /** The reading key changed: new in-key bonus, and the chord on screen is read in it. */
  function setKey(next: Key | null) {
    if (sameKey(next, key)) return;
    key = next ? { tonic: next.tonic, mode: next.mode } : null;
    dominant = !!key && keys.dominantTonic(key);
    updateInKey();
    // the first chord, heard before any key, is a Cm that the key C major reads as C
    if (lastHeard)
      showChord(lastHeardT, shownFor(lastHeard, lastSource), lastConfidence, lastSource);
  }

  function rebuild() {
    level = effectiveVocabLevel(cfg);
    bank = bankFor(cfg);
    sims = new Float32Array(bank.size + 1);
    smoother = createSmoother({ numStates: bank.size + 1, stability: cfg.stability });
    lastDecodedFrame = -1;
    pending = null;
    updateInKey();
  }

  /** The chord shown for a heard chord: mic chords are read in the current key. */
  function shownFor(heard: Chord | null, source: InputSource): Chord | null {
    if (!heard) return heard;
    if (source !== 'mic') return cfg.mode === 'room' ? bandTriad(heard, key) : heard;
    return keyReading(heard, key, level, keys.blues(key));
  }

  /**
   * A heard chord passed the dwell gate. The key estimator sees what was heard (so a Dm under a
   * provisional D-major key still counts as Dm); the display shows the key reading of it, and
   * only on a real change: a new bass note or added tone over the same chord is not one.
   */
  function emitChord(t: number, heard: Chord | null, confidence: number, source: InputSource) {
    if (sameChordFamily(heard, lastHeard)) return;
    lastHeard = heard;
    lastHeardT = t;
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
      let need = lastHeard && lastHeard.root === chord.root ? dwell * SAME_ROOT_DWELL : dwell;
      // with a band, a chord outside the key has to hold before it is believed
      if (cfg.mode === 'room' && key && !inKey(chord, key, dominant))
        need = Math.max(need, OUT_OF_KEY_HOLD_SEC);
      if (tEnd - pending.t0 + 1e-6 >= need) {
        emitChord(pending.t0, pending.chord, pending.confidence, 'mic');
        pending = null;
      }
      return;
    }
    // A new chord needs continuous evidence. Separate short noises must not accumulate
    // dwell across uncertain frames, even when nothing has been shown yet.
    pending = null;
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
    micNotes.reset();
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
    }
    quiet[smoother.frames % TIME_RING] = silent && frame.t - lastSoundT >= RELEASE_HOLD_SEC ? 1 : 0;
    emitNotes(frame.t, micNotes.push(frame.t, frame.noteChroma ?? frame.chroma, silent));
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
      // the room bank has its own qualities, so a mode change rebuilds too
      if (effectiveVocabLevel(cfg) !== level || cfg.mode !== prev.mode) rebuild();
      else if (cfg.stability !== prev.stability) smoother.setStability(cfg.stability);
    },
    push(frame) {
      emitter.emit({ type: 'level', t: frame.t, energy: frame.energy });
      if (frame.exact) pushExact(frame);
      else pushMic(frame);
      const changed = keys.push(frame) !== null;
      const pub = publisher.update(frame.t, keys, changed);
      if (pub) {
        const e: KeyEvent = { type: 'key', t: pub.t, key: pub.key, id: pub.id, since: pub.since };
        if (pub.supersedes !== undefined) {
          e.supersedes = pub.supersedes;
          e.replacesSince = pub.replacesSince;
        }
        emitter.emit(e);
      }
      if (changed || pub) setKey(publisher.current() ?? keys.current());
      else if (key && keys.dominantTonic(key) !== dominant) {
        dominant = !dominant;
        updateInKey();
      }
    },
    resetKey() {
      keys.reset();
      publisher.reset();
      setKey(null);
    },
    reset() {
      keys.reset();
      publisher.reset(true);
      key = null;
      dominant = false;
      inKeyBonus = null;
      bass.reset();
      micNotes.reset();
      rebuild();
      lastChord = null;
      lastHeard = null;
      lastHeardT = 0;
      lastSureT = -Infinity;
      lastNotes = '';
      lastSoundT = -Infinity;
      prevBass = null;
    },
    subscribe: (cb) => emitter.subscribe(cb),
  };
}
