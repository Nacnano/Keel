/**
 * Key publishing: which of the key estimator's estimates become `key` events.
 *
 * The estimator settles on a key quickly and may still change its mind in the first seconds
 * (a song that opens on V reads as V's key for a few seconds). Every estimate is used inside the
 * engine (chord readings, the in-key preference), but a key is only *published* once it is
 * confirmed, and a published key that turns out short is withdrawn instead of being kept as a
 * key change:
 *
 * - **Confirmation**: the first key of a song (after a reset or `resetKey`) is published once
 *   the estimator's key has led every other key for `confirmSec` seconds (time it trails is
 *   taken off again), or sooner when it is unmistakable (correlation ≥ `quickConfidence` and a
 *   lead ≥ `quickLead`, held for `quickSec`). It is dated from the song's first sound, so the
 *   chords before it are numbered in it.
 * - **Parallel key**: the same tonic in the other mode (C major → C minor) is never a change.
 *   The published mode stays (it had the evidence when it was confirmed); the other mode only
 *   replaces it as a correction inside the supersede window.
 * - **Short keys are withdrawn**: when the estimate changes less than `supersedeSec` after the
 *   published key's own evidence started, the new key replaces it from the published key's
 *   start (`t`) and names it in `supersedes`. Otherwise it is a key change, dated from where the
 *   new key's lead began.
 */
import type { Key, KeyEstimate } from '@/core';

export interface KeyPublisherOptions {
  /** Seconds the estimate has to lead before the first key of a song is published. */
  confirmSec: number;
  /** Early publication: correlation of the estimate at least this... */
  quickConfidence: number;
  /** ...and a lead over every other key (relative pairs) of at least this... */
  quickLead: number;
  /** ...held for this many seconds. */
  quickSec: number;
  /** A published key replaced less than this many seconds after its evidence began is withdrawn. */
  supersedeSec: number;
  /** Largest frame gap counted (seconds). */
  maxFrameGap: number;
}

export const DEFAULT_PUBLISHER_OPTIONS: KeyPublisherOptions = {
  confirmSec: 4,
  quickConfidence: 0.85,
  quickLead: 0.3,
  quickSec: 1,
  supersedeSec: 10,
  maxFrameGap: 0.25,
};

/** What the publisher reads from the key estimator. */
export interface KeySource {
  /** Current estimate, or null before the first one. */
  current(): KeyEstimate | null;
  /** Where the current estimate's evidence started. */
  since(): number | null;
  /** Lead of the current estimate over the best other key (negative when it trails). */
  lead(): number;
}

export interface KeyPublication {
  key: KeyEstimate;
  /** Where the key is drawn from (see `KeyEvent.t`). */
  t: number;
  /** Where this key's own evidence started (≥ `t` for a first key or a replacement). */
  since: number;
  id: number;
  /** `id` of the published key this one withdraws... */
  supersedes?: number;
  /** ...and that key's start (equal to `t`). */
  replacesSince?: number;
}

export interface KeyPublisher {
  /**
   * Feed one frame at time `t`. `changed` is true when the estimator changed its key on this
   * frame. Returns a publication when a key event is due.
   */
  update(t: number, source: KeySource, changed: boolean): KeyPublication | null;
  /** The published key, or null while the key is still being confirmed. */
  current(): KeyEstimate | null;
  /**
   * Forget the published key (new song): the next key has to be confirmed again. With
   * `session` (a new jam) the event ids start again from 1 as well.
   */
  reset(session?: boolean): void;
}

const sameKey = (a: Key, b: Key) => a.tonic === b.tonic && a.mode === b.mode;

export function createKeyPublisher(options: Partial<KeyPublisherOptions> = {}): KeyPublisher {
  const opts = { ...DEFAULT_PUBLISHER_OPTIONS, ...options };
  let nextId = 1;
  let lastT: number | null = null;
  /** First evidence time of this song (the first estimate's `since`). */
  let songStart: number | null = null;
  /** Tonic being confirmed, its lead time and its unmistakable time. */
  let holdTonic = -1;
  let held = 0;
  let quick = 0;
  let published: { id: number; key: KeyEstimate; t: number; evidence: number } | null = null;

  /** Publish `key` drawn from `t`; with `withdraw`, it replaces the published key. */
  function publish(key: KeyEstimate, t: number, evidence: number, withdraw = false) {
    const id = nextId++;
    const replaced = published;
    published = { id, key, t, evidence };
    const out: KeyPublication = { key, t, since: evidence, id };
    if (withdraw && replaced) {
      out.supersedes = replaced.id;
      out.replacesSince = replaced.t;
    }
    return out;
  }

  function confirm(t: number, dt: number, source: KeySource): KeyPublication | null {
    const est = source.current();
    if (!est) return null;
    songStart ??= source.since() ?? t;
    // the parallel key is the same key being confirmed: only the tonic resets the clock
    if (est.tonic !== holdTonic) {
      holdTonic = est.tonic;
      held = 0;
      quick = 0;
    }
    const lead = source.lead();
    held = lead > 0 ? held + dt : Math.max(0, held - dt);
    quick = est.confidence >= opts.quickConfidence && lead >= opts.quickLead ? quick + dt : 0;
    if (held + 1e-9 < opts.confirmSec && quick + 1e-9 < opts.quickSec) return null;
    // drawn from the song's start, but short or not by its own evidence (a key that only took
    // the lead at 6 s and loses it at 13 s is still a short key)
    return publish(est, songStart, Math.max(songStart, source.since() ?? songStart));
  }

  return {
    update(t, source, changed) {
      const dt = lastT === null ? 0 : Math.min(opts.maxFrameGap, Math.max(0, t - lastT));
      lastT = t;
      if (!published) return confirm(t, dt, source);
      if (!changed) return null;
      const est = source.current();
      if (!est || sameKey(est, published.key)) return null;
      const since = Math.min(t, Math.max(published.t, source.since() ?? t));
      const short = since - published.evidence < opts.supersedeSec;
      if (short) return publish(est, published.t, since, true);
      // never a change to the parallel key: the published mode stays
      if (est.tonic === published.key.tonic) return null;
      return publish(est, since, since);
    },
    current: () => published?.key ?? null,
    reset(session = false) {
      if (session) nextId = 1;
      lastT = null;
      songStart = null;
      holdTonic = -1;
      held = 0;
      quick = 0;
      published = null;
    },
  };
}
