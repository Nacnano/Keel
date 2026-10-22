import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import type { ChordRecord, MarkerKind } from '@/core';
import type { SessionFull } from '@/data';
import { useSettings } from '@/state/settingsStore';
import { Button } from '../components/Button';
import { ChordLane } from '../components/ChordLane';
import { ChordPicker } from '../components/ChordPicker';
import { MarkerLane, MarkerToolbar } from '../components/MarkerLane';
import { PianoRoll } from '../components/PianoRoll';
import { buildNoteIndex } from '../components/PianoRoll.logic';
import { SummaryCard } from '../components/SummaryCard';
import { Toaster } from '../components/Toast';
import { toast } from '../components/toastStore';
import { keyLabel, pretty } from '../lib/chordLabel';
import { MARKER_LABEL } from '../lib/markers';
import { ExportMenu } from './library/ExportMenu';
import { chordText, keyAtTime } from './review/chordText';
import { NameField } from './review/NameField';
import { TagEditor } from './review/TagEditor';
import { TimeRuler } from './review/TimeRuler';
import {
  clampViewport,
  clockLabel,
  DEFAULT_PX_PER_SEC,
  indexAt,
  visibleSeconds,
  zoomAt,
  type TimeViewport,
} from './review/timeline';
import { Transport } from './review/Transport';
import { useElementSize } from './review/useElementSize';
import { usePlayback } from './review/usePlayback';
import { useReviewSession, type ReviewSessionApi } from './review/useReviewSession';
import { useReviewShortcuts } from './review/useReviewShortcuts';
import { useTimeGestures } from './review/useTimeGestures';

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `/review/:id`: synced playback, chord lane, piano roll, markers and summary (DESIGN.md §3.2). */
export function ReviewScreen() {
  const { id } = useParams();
  const api = useReviewSession(id);
  const { load } = api;

  if (load.status === 'loading') {
    return (
      <Centered>
        <p role="status" className="animate-pulse text-zinc-400">
          Loading session…
        </p>
      </Centered>
    );
  }
  if (load.status === 'missing' || load.status === 'error') {
    return (
      <Centered>
        <h1 className="text-xl font-semibold text-white">
          {load.status === 'missing' ? 'Session not found' : 'Could not open this session'}
        </h1>
        <p className="max-w-sm text-center text-sm text-zinc-400">
          {load.status === 'missing'
            ? 'It may have been deleted, or the link is from another device.'
            : load.message}
        </p>
        <Link
          to="/library"
          className="inline-flex min-h-11 items-center rounded-xl bg-zinc-800 px-4 text-sm text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-violet-300"
        >
          Back to library
        </Link>
      </Centered>
    );
  }
  return <ReviewLoaded full={load.full} api={api} />;
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">{children}</div>
  );
}

function ReviewLoaded({ full, api }: { full: SessionFull; api: ReviewSessionApi }) {
  const { session, chords, keys, markers, midiTrack, recording } = full;
  const settings = useSettings(
    useShallow((s) => ({
      spellingFollowsKey: s.spellingFollowsKey,
      showSlashChords: s.showSlashChords,
    })),
  );

  const midiEvents = midiTrack?.events ?? null;
  const noteIndex = useMemo(() => buildNoteIndex(midiEvents ?? []), [midiEvents]);
  const hasMidi = noteIndex.notes.length > 0;
  const duration = Math.max(
    session.durationSec,
    recording?.durationSec ?? 0,
    noteIndex.end,
    chords.length ? chords[chords.length - 1].t + 1 : 0,
    1,
  );

  const { controller, time, playing, rate, source, pianoOn, piano, hasAudio, attachAudio } =
    usePlayback({ duration, recording, midiEvents: hasMidi ? midiEvents : null });

  // Shared horizontal viewport for ruler, chord lane, markers and piano roll.
  const lanes = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(lanes);
  const [rawViewport, setRawViewport] = useState<TimeViewport>({
    start: 0,
    pxPerSec: DEFAULT_PX_PER_SEC,
  });
  // Follows the playhead until the user scrolls or zooms by hand; play and seek re-enable it.
  const [follow, setFollow] = useState(true);
  let viewport = clampViewport(rawViewport, width, duration);
  const visible = visibleSeconds(viewport, width);
  if (follow && (time < viewport.start || time > viewport.start + visible * 0.92)) {
    // Page the view (adjusting state during render: no extra effect pass, no flicker).
    const paged = clampViewport({ ...viewport, start: time - visible * 0.1 }, width, duration);
    if (paged.start !== viewport.start) {
      viewport = paged;
      setRawViewport(paged);
    }
  }
  const onViewportChange = useCallback(
    (v: TimeViewport) => {
      setFollow(false);
      setRawViewport(clampViewport(v, width, duration));
    },
    [width, duration],
  );

  // Wheel zoom anywhere over the lanes (the roll and ruler handle drag/pinch themselves).
  useTimeGestures(lanes, { viewport, onViewportChange, drag: false });

  const seek = useCallback(
    (t: number) => {
      setFollow(true);
      controller.seek(t);
    },
    [controller],
  );
  const toggle = useCallback(() => {
    setFollow(true);
    controller.toggle();
  }, [controller]);

  const zoom = (factor: number) => {
    const anchorX = Math.max(0, Math.min(width, (time - viewport.start) * viewport.pxPerSec));
    setRawViewport(clampViewport(zoomAt(viewport, factor, anchorX), width, duration));
  };
  const fitAll = () => {
    setFollow(false);
    setRawViewport({ start: 0, pxPerSec: 0 }); // clamping raises it to "whole session fits"
  };

  // Chord + key at the playhead.
  const currentIdx = indexAt(chords, time);
  const currentRec = currentIdx >= 0 ? chords[currentIdx] : null;
  const currentKey = keyAtTime(keys, time);
  const current = currentRec
    ? chordText(currentRec, currentKey, {
        spellingFollowsKey: settings.spellingFollowsKey,
        showSlash: settings.showSlashChords,
      })
    : null;
  const chordTimes = useMemo(() => chords.map((c) => c.t), [chords]);

  // Chord editing.
  const [editing, setEditing] = useState<ChordRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const saveChord = async (chord: ChordRecord['chord']) => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateChord(editing, chord);
      setEditing(null);
      toast('Chord updated', { tone: 'success', durationMs: 1500 });
    } catch (err) {
      toast(`Could not save the chord: ${errorText(err)}`, { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Markers.
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const run = (p: Promise<unknown>, what: string): Promise<void> =>
    p.then(
      () => undefined,
      (err: unknown) => {
        toast(`Could not ${what}: ${errorText(err)}`, { tone: 'error' });
      },
    );
  const addMarker = (kind: MarkerKind, t: number) =>
    run(
      api.addMarker(kind, t).then((m) => {
        setSelectedMarker(m.id);
        toast(`${MARKER_LABEL[kind]} at ${clockLabel(m.t)}`, { durationMs: 1500 });
      }),
      'add the marker',
    );
  const deleteMarker = (markerId: string) => {
    if (selectedMarker === markerId) setSelectedMarker(null);
    void run(api.deleteMarker(markerId), 'delete the marker');
  };

  useReviewShortcuts(
    {
      toggle,
      skip: (s) => seek(controller.position() + s),
      bookmark: () => void addMarker('bookmark', controller.position()),
      zoom,
    },
    editing === null,
  );

  const keyList = session.summary?.keys.length
    ? session.summary.keys.map((k) => k.key)
    : keys
        .map((k) => k.key)
        .filter((k, i, a) => a.findIndex((x) => x.tonic === k.tonic && x.mode === k.mode) === i);
  const editingKey = editing ? keyAtTime(keys, editing.t) : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),24px)] lg:px-8">
        <header className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Link
              to="/library"
              className="w-fit text-xs font-medium tracking-widest text-zinc-500 uppercase hover:text-zinc-300"
            >
              ← Library
            </Link>
            <NameField
              value={session.name}
              onCommit={(name) => run(api.rename(name), 'rename the session')}
              className="text-2xl font-semibold lg:text-3xl"
            />
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-400">
              <span>{fmtDate(session.createdAt)}</span>
              <span aria-label="Duration">{clockLabel(session.durationSec)}</span>
              {keyList.length > 0 && (
                <span data-testid="review-keys" className="text-violet-200">
                  {keyList.map((k) => pretty(keyLabel(k, settings))).join(' · ')}
                </span>
              )}
              {recording && <span>Audio</span>}
              {hasMidi && <span>MIDI</span>}
            </p>
            <TagEditor
              tags={session.tags}
              onChange={(tags) => run(api.setTags(tags), 'save the tags')}
              className="mt-1"
            />
          </div>
          <ExportMenu getFull={async () => full} />
        </header>

        <section
          aria-label="Playback"
          className="flex flex-col gap-4 rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900"
        >
          {hasAudio && (
            <audio
              ref={attachAudio}
              preload="auto"
              onEnded={() => controller.handleAudioEnded()}
              className="hidden"
            />
          )}
          <Transport
            time={time}
            duration={duration}
            playing={playing}
            rate={rate}
            source={source}
            hasMidi={hasMidi}
            hasAudio={hasAudio}
            pianoOn={pianoOn}
            piano={piano}
            onToggle={toggle}
            onSeek={seek}
            onRate={(r) => controller.setRate(r)}
            onPiano={(on) => controller.setPianoOn(on)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-h-11 items-baseline gap-3" aria-live="off">
              <span className="text-xs tracking-widest text-zinc-500 uppercase">Now</span>
              <span data-testid="playhead-chord" className="text-3xl font-semibold text-white">
                {current?.symbol ?? '—'}
              </span>
              <span className="text-base text-zinc-400">{current?.numeral}</span>
              {currentKey && (
                <span className="text-sm text-violet-200">
                  {pretty(keyLabel(currentKey, settings))}
                </span>
              )}
            </div>
            {currentRec && (
              <Button variant="ghost" onClick={() => setEditing(currentRec)}>
                Edit this chord
              </Button>
            )}
            <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                title="Zoom out (−)"
                onClick={() => zoom(1 / 1.5)}
              >
                −
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                title="Zoom in (+)"
                onClick={() => zoom(1.5)}
              >
                +
              </Button>
              <Button variant="ghost" onClick={fitAll}>
                Fit
              </Button>
            </div>
          </div>

          <div
            ref={lanes}
            className="flex flex-col overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-800"
          >
            <div className="relative">
              <TimeRuler
                viewport={viewport}
                onViewportChange={onViewportChange}
                width={width}
                duration={duration}
                onSeek={seek}
              />
              <ChordLane
                chords={chords}
                keys={keys}
                duration={duration}
                viewport={viewport}
                width={width}
                time={time}
                onSeek={seek}
                onEdit={setEditing}
                spellingFollowsKey={settings.spellingFollowsKey}
                showSlash={settings.showSlashChords}
              />
              <MarkerLane
                markers={markers}
                viewport={viewport}
                width={width}
                duration={duration}
                selectedId={selectedMarker}
                onSelect={setSelectedMarker}
                onSeek={seek}
                onMove={(mid, t) => void run(api.moveMarker(mid, t), 'move the marker')}
                onDelete={deleteMarker}
                className="border-t border-zinc-900"
              />
              {/* Playhead across the DOM lanes (the roll draws its own). */}
              <Playhead x={(time - viewport.start) * viewport.pxPerSec} width={width} />
            </div>
            {hasMidi && (
              <PianoRoll
                index={noteIndex}
                viewport={viewport}
                onViewportChange={onViewportChange}
                time={time}
                onSeek={seek}
                playheadLabel={current && current.symbol !== '—' ? current.symbol : undefined}
                chordTimes={chordTimes}
                className="h-56 border-t border-zinc-800 lg:h-72"
              />
            )}
          </div>
          <MarkerToolbar
            time={Math.min(duration, time)}
            selected={markers.find((m) => m.id === selectedMarker) ?? null}
            onAdd={(kind, t) => void addMarker(kind, t)}
            onDelete={deleteMarker}
            onChangeKind={(mid, kind) =>
              void run(api.changeMarkerKind(mid, kind), 'change the marker')
            }
            onDeselect={() => setSelectedMarker(null)}
          />
          <p className="hidden text-xs text-zinc-600 lg:block">
            Space play/pause · ←/→ skip 5 s · B bookmark · +/− zoom · click a chord to jump,
            right-click or long-press to fix it
          </p>
        </section>

        <SummaryCard
          summary={session.summary}
          durationSec={session.durationSec}
          spellingFollowsKey={settings.spellingFollowsKey}
          showSlash={settings.showSlashChords}
        />
      </div>

      {editing && (
        <ChordPicker
          key={editing.id}
          open
          initial={editing.chord}
          keyContext={editingKey}
          level={session.vocabLevel}
          atLabel={clockLabel(editing.t, true)}
          spellingFollowsKey={settings.spellingFollowsKey}
          saving={saving}
          onClose={() => setEditing(null)}
          onSave={(c) => void saveChord(c)}
        />
      )}
      <Toaster />
    </div>
  );
}

function Playhead({ x, width }: { x: number; width: number }) {
  if (x < -2 || (width > 0 && x > width + 2)) return null;
  return (
    <div
      aria-hidden
      data-testid="playhead"
      className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-violet-300"
      style={{ left: x }}
    />
  );
}
