import { useCallback, useEffect, useState } from 'react';
import type { Chord, ChordRecord, Marker, MarkerKind, Session } from '@/core';
import {
  addMarker as repoAddMarker,
  deleteMarker as repoDeleteMarker,
  getSession,
  getSessionFull,
  renameSession,
  setTags as repoSetTags,
  updateChord as repoUpdateChord,
  updateChordsLike as repoUpdateChordsLike,
  updateMarker as repoUpdateMarker,
  type SessionFull,
} from '@/data';

export type ReviewLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; full: SessionFull };

const byT = <T extends { t: number }>(a: T, b: T) => a.t - b.t;

function sorted(full: SessionFull): SessionFull {
  return {
    ...full,
    chords: [...full.chords].sort(byT),
    keys: [...full.keys].sort(byT),
    markers: [...full.markers].sort(byT),
  };
}

export interface ReviewSessionApi {
  load: ReviewLoad;
  rename(name: string): Promise<void>;
  setTags(tags: string[]): Promise<void>;
  updateChord(rec: ChordRecord, chord: Chord | null): Promise<ChordRecord>;
  /** Every chord with the same root and quality as `match` becomes `chord`; returns how many. */
  updateChordsLike(match: Chord, chord: Chord | null): Promise<number>;
  addMarker(kind: MarkerKind, t: number, label?: string): Promise<Marker>;
  moveMarker(id: string, t: number): Promise<void>;
  changeMarkerKind(id: string, kind: MarkerKind): Promise<void>;
  deleteMarker(id: string): Promise<void>;
}

/**
 * Loads one session with `getSessionFull` and exposes the review edits. Every edit writes
 * through `src/data` first, then patches local state (and re-reads the session row so the
 * summary the repo recomputes shows up).
 */
export function useReviewSession(id: string | undefined): ReviewSessionApi {
  // Keyed by id so a route change shows "loading" without a synchronous reset in the effect.
  const [entry, setEntry] = useState<{ id: string; load: ReviewLoad } | null>(null);
  const load: ReviewLoad = !id
    ? { status: 'missing' }
    : entry?.id === id
      ? entry.load
      : { status: 'loading' };

  useEffect(() => {
    if (!id) return;
    let alive = true;
    getSessionFull(id).then(
      (full) => {
        if (!alive) return;
        setEntry({
          id,
          load:
            full && !full.session.deleted
              ? { status: 'ready', full: sorted(full) }
              : { status: 'missing' },
        });
      },
      (err: unknown) => {
        if (!alive) return;
        setEntry({
          id,
          load: { status: 'error', message: err instanceof Error ? err.message : String(err) },
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);

  const patch = useCallback((fn: (full: SessionFull) => SessionFull) => {
    setEntry((e) =>
      e && e.load.status === 'ready'
        ? { id: e.id, load: { status: 'ready', full: fn(e.load.full) } }
        : e,
    );
  }, []);

  const refreshSession = useCallback(async () => {
    if (!id) return;
    const s: Session | undefined = await getSession(id);
    if (s) patch((f) => ({ ...f, session: s }));
  }, [id, patch]);

  const rename = useCallback(
    async (name: string) => {
      if (!id) return;
      await renameSession(id, name);
      await refreshSession();
    },
    [id, refreshSession],
  );

  const setTags = useCallback(
    async (tags: string[]) => {
      if (!id) return;
      await repoSetTags(id, tags);
      await refreshSession();
    },
    [id, refreshSession],
  );

  const updateChord = useCallback(
    async (rec: ChordRecord, chord: Chord | null) => {
      const updated = await repoUpdateChord(rec.id, chord);
      patch((f) => ({ ...f, chords: f.chords.map((c) => (c.id === updated.id ? updated : c)) }));
      await refreshSession();
      return updated;
    },
    [patch, refreshSession],
  );

  const updateChordsLike = useCallback(
    async (match: Chord, chord: Chord | null) => {
      if (!id) return 0;
      const updated = new Map((await repoUpdateChordsLike(id, match, chord)).map((r) => [r.id, r]));
      patch((f) => ({ ...f, chords: f.chords.map((c) => updated.get(c.id) ?? c) }));
      await refreshSession();
      return updated.size;
    },
    [id, patch, refreshSession],
  );

  const addMarker = useCallback(
    async (kind: MarkerKind, t: number, label?: string) => {
      if (!id) throw new Error('No session');
      const m = await repoAddMarker(id, label === undefined ? { t, kind } : { t, kind, label });
      patch((f) => ({ ...f, markers: [...f.markers, m].sort(byT) }));
      await refreshSession();
      return m;
    },
    [id, patch, refreshSession],
  );

  const applyMarker = useCallback(
    (m: Marker) =>
      patch((f) => ({
        ...f,
        markers: f.markers.map((x) => (x.id === m.id ? m : x)).sort(byT),
      })),
    [patch],
  );

  const moveMarker = useCallback(
    async (markerId: string, t: number) => {
      applyMarker(await repoUpdateMarker(markerId, { t }));
      await refreshSession();
    },
    [applyMarker, refreshSession],
  );

  const changeMarkerKind = useCallback(
    async (markerId: string, kind: MarkerKind) => {
      applyMarker(await repoUpdateMarker(markerId, { kind }));
      await refreshSession();
    },
    [applyMarker, refreshSession],
  );

  const deleteMarker = useCallback(
    async (markerId: string) => {
      await repoDeleteMarker(markerId);
      patch((f) => ({ ...f, markers: f.markers.filter((m) => m.id !== markerId) }));
      await refreshSession();
    },
    [patch, refreshSession],
  );

  return {
    load,
    rename,
    setTags,
    updateChord,
    updateChordsLike,
    addMarker,
    moveMarker,
    changeMarkerKind,
    deleteMarker,
  };
}
