import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Bookmark,
  ChevronLeft,
  Ellipsis,
  FileQuestion,
  Keyboard,
  Maximize2,
  Pencil,
  Share,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { auditionChord } from '@/app/live/audition';
import type { Chord, ChordRecord, MarkerKind } from '@/core';
import type { SessionFull } from '@/data';
import { useSettings } from '@/state/settingsStore';
import { sameChord } from '@/theory';
import { Badge, Button, EmptyState, Group, Row, Sheet, Toolbar } from '../kit';
import { ChordLane } from '../components/ChordLane';
import { ChordPicker } from '../components/ChordPicker';
import { MarkerLane, MarkerToolbar } from '../components/MarkerLane';
import { PianoRoll } from '../components/PianoRoll';
import { ReharmPanel, type ReharmSource } from '../components/ReharmPanel';
import { buildNoteIndex } from '../components/PianoRoll.logic';
import { SummaryCard } from '../components/SummaryCard';
import { toast } from '../components/toastStore';
import { keyLabel, pretty } from '../lib/chordLabel';
import { MARKER_LABEL } from '../lib/markers';
import { useSync } from '@/sync/store';
import { DownloadItems, ShareLinkItem } from './library/ShareItems';
import { runExport, shareChartWithToast } from './library/exportActions';
import { GRAY_LINK, PLAIN_LINK } from './library/linkStyles';
import { Menu, MenuItem, MenuSeparator } from './library/Menu';
import { ChartCard } from './review/ChartCard';
import { chordText, keyAtTime } from './review/chordText';
import { NameField } from './review/NameField';
import { ShareDialog } from './review/ShareDialog';
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
import { useMediaQuery } from '../lib/useMediaQuery';

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
      <div className="flex h-full items-center justify-center p-6">
        <p role="status" className="anim-pulse-soft text-subhead text-label-2">
          Loading session…
        </p>
      </div>
    );
  }
  if (load.status === 'missing' || load.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<FileQuestion aria-hidden />}
          title={load.status === 'missing' ? 'Session not found' : 'Could not open this session'}
          description={
            load.status === 'missing'
              ? 'It may have been deleted, or the link is from another device.'
              : load.message
          }
          action={
            <Link to="/library" className={GRAY_LINK}>
              Back to library
            </Link>
          }
        />
      </div>
    );
  }
  return <ReviewLoaded full={load.full} api={api} />;
}

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['Space', 'Play or pause'],
  ['← / →', 'Skip 5 s (Shift: 1 s)'],
  ['B', 'Bookmark at the playhead'],
  ['+ / −', 'Zoom in or out'],
  ['E', 'Edit the focused chord'],
  ['Delete', 'Remove the focused marker'],
];

function ReviewLoaded({ full, api }: { full: SessionFull; api: ReviewSessionApi }) {
  const { session, chords, keys, markers, midiTrack, recording } = full;
  const syncConfigured = useSync((s) => s.configured);
  const syncUser = useSync((s) => s.user);
  const [shareOpen, setShareOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Keyboard shortcut hints are noise on a touch screen.
  const touch = useMediaQuery('(pointer: coarse)');
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

  // Reharmonize: the summary's top progressions, or up to four chords from the playhead.
  const summary = session.summary;
  const reharmSources = useMemo<ReharmSource[]>(() => {
    const home = summary?.keys[0]?.key ?? keys[0]?.key;
    if (!summary || !home) return [];
    const key = { tonic: home.tonic, mode: home.mode };
    return summary.topProgressions.slice(0, 3).map((p, i) => ({
      id: `top:${i}`,
      label: `Top ${i + 1} ×${p.count}`,
      chords: p.chords,
      key,
    }));
  }, [summary, keys]);
  const captureAtPlayhead = useCallback(() => {
    const start = Math.max(0, indexAt(chords, controller.position()));
    const picked: Chord[] = [];
    for (let i = start; i < chords.length && picked.length < 4; i++) {
      const c = chords[i].chord;
      if (c && !sameChord(picked[picked.length - 1], c)) picked.push(c);
    }
    const k = keyAtTime(keys, chords[start]?.t ?? 0);
    if (!picked.length || !k) return null;
    return { chords: picked, key: { tonic: k.tonic, mode: k.mode } };
  }, [chords, keys, controller]);

  const getFull = useCallback(async () => full, [full]);
  const share = () => void runExport(getFull, shareChartWithToast)();
  const openShareLink = () => {
    if (!syncUser) {
      toast('Sign in under Settings → Account & sync to share a link.', { durationMs: 3500 });
    } else setShareOpen(true);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Toolbar
        leading={
          <Link to="/library" className={`${PLAIN_LINK} -ml-3 gap-0.5 px-2`}>
            <ChevronLeft className="size-6" aria-hidden />
            <span className="max-sm:sr-only">Library</span>
          </Link>
        }
        title={
          <NameField
            value={session.name}
            onCommit={(name) => run(api.rename(name), 'rename the session')}
            className="max-w-[calc(100vw-9rem)] text-center sm:max-w-md"
          />
        }
        trailing={
          <>
            <Button
              icon
              variant="plain"
              aria-label="Share"
              title="Share the chord chart"
              onClick={share}
            >
              <Share className="size-5" aria-hidden />
            </Button>
            <Menu
              align="end"
              width={260}
              aria-label="More"
              trigger={(t) => (
                <Button icon variant="plain" aria-label="More" {...t}>
                  <Ellipsis className="size-5" aria-hidden />
                </Button>
              )}
            >
              {syncConfigured && <ShareLinkItem onSelect={openShareLink} />}
              <DownloadItems getFull={getFull} />
              <MenuSeparator />
              <MenuItem
                icon={<Pencil />}
                disabled={!currentRec}
                onSelect={() => currentRec && setEditing(currentRec)}
              >
                Edit chord at playhead
              </MenuItem>
              <MenuItem
                icon={<Bookmark />}
                onSelect={() => void addMarker('bookmark', controller.position())}
              >
                Bookmark at playhead
              </MenuItem>
              <MenuItem icon={<Maximize2 />} onSelect={fitAll}>
                Show whole session
              </MenuItem>
              {!touch && (
                <>
                  <MenuSeparator />
                  <MenuItem icon={<Keyboard />} onSelect={() => setShortcutsOpen(true)}>
                    Keyboard shortcuts
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        }
      />
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} sessionId={session.id} />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),32px)] lg:px-6">
        <header className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-subhead text-label-2">
            {keyList.length > 0 && (
              <>
                <span data-testid="review-keys" className="font-semibold text-label">
                  {keyList.map((k) => pretty(keyLabel(k, settings))).join(' · ')}
                </span>
                <span aria-hidden className="text-label-4">
                  ·
                </span>
              </>
            )}
            <span aria-label="Duration" className="tabular">
              {clockLabel(session.durationSec)}
            </span>
            <span aria-hidden className="text-label-4">
              ·
            </span>
            <span>{fmtDate(session.createdAt)}</span>
            {recording && <Badge className="ml-1">Audio</Badge>}
            {hasMidi && <Badge className={recording ? '' : 'ml-1'}>MIDI</Badge>}
          </p>
        </header>

        <ChartCard
          full={full}
          spellingFollowsKey={settings.spellingFollowsKey}
          showSlash={settings.showSlashChords}
        />

        <section aria-label="Playback" className="flex flex-col gap-4">
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

          <div className="overflow-hidden rounded-card bg-surface">
            <div className="hairline-b flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <div className="flex min-w-0 items-baseline gap-2.5" aria-live="off">
                <span className="text-caption font-medium tracking-wide text-label-3 uppercase">
                  Now
                </span>
                <span
                  data-testid="playhead-chord"
                  className="text-title-2 font-bold tracking-tight text-label"
                >
                  {current?.symbol ?? '—'}
                </span>
                <span className="text-subhead font-medium text-accent">{current?.numeral}</span>
                {currentKey && (
                  <span className="text-subhead text-label-2">
                    {pretty(keyLabel(currentKey, settings))}
                  </span>
                )}
              </div>
              {currentRec && (
                <Button
                  variant="plain"
                  size="sm"
                  leading={<Pencil className="size-3.5" aria-hidden />}
                  onClick={() => setEditing(currentRec)}
                >
                  Edit chord
                </Button>
              )}
              <div className="ml-auto flex items-center" role="group" aria-label="Zoom">
                <Button
                  variant="plain"
                  icon
                  size="sm"
                  aria-label="Zoom out"
                  title="Zoom out (−)"
                  onClick={() => zoom(1 / 1.5)}
                >
                  <ZoomOut className="size-[18px]" aria-hidden />
                </Button>
                <Button
                  variant="plain"
                  icon
                  size="sm"
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  onClick={() => zoom(1.5)}
                >
                  <ZoomIn className="size-[18px]" aria-hidden />
                </Button>
                <Button variant="plain" size="sm" onClick={fitAll} title="Show whole session">
                  Fit
                </Button>
              </div>
            </div>

            <div ref={lanes} className="flex flex-col">
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
                  className="hairline-t"
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
                  className="hairline-t"
                />
                {/* Playhead across the DOM lanes (the roll draws its own). */}
                <Playhead x={(time - viewport.start) * viewport.pxPerSec} width={width} />
              </div>
              {hasMidi && (
                <div className="hairline-t pt-px">
                  <PianoRoll
                    index={noteIndex}
                    viewport={viewport}
                    onViewportChange={onViewportChange}
                    time={time}
                    onSeek={seek}
                    playheadLabel={current && current.symbol !== '—' ? current.symbol : undefined}
                    chordTimes={chordTimes}
                    className="h-56 lg:h-72"
                  />
                </div>
              )}
            </div>
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
          <p className="hidden text-caption text-label-3 lg:pointer-fine:block">
            Click a chord to jump there; right-click or long-press it to fix it. Space plays, B
            bookmarks.{' '}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="text-accent hover:underline"
            >
              All shortcuts
            </button>
          </p>
        </section>

        <TagEditor
          tags={session.tags}
          onChange={(tags) => run(api.setTags(tags), 'save the tags')}
        />

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <SummaryCard
            summary={session.summary}
            durationSec={session.durationSec}
            spellingFollowsKey={settings.spellingFollowsKey}
            showSlash={settings.showSlashChords}
          />
          <ReharmPanel
            sources={reharmSources}
            capture={captureAtPlayhead}
            onAudition={auditionChord}
            spellingFollowsKey={settings.spellingFollowsKey}
            showSlash={settings.showSlashChords}
            className="lg:pt-7"
          />
        </div>
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

      <Sheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        placement="center"
        title="Keyboard shortcuts"
      >
        <Group className="pt-1">
          {SHORTCUTS.map(([keys, what]) => (
            <Row
              key={keys}
              label={what}
              accessory={
                <kbd className="rounded-[6px] bg-fill-3 px-2 py-0.5 font-sans text-footnote text-label">
                  {keys}
                </kbd>
              }
            />
          ))}
        </Group>
      </Sheet>
    </div>
  );
}

function Playhead({ x, width }: { x: number; width: number }) {
  if (x < -2 || (width > 0 && x > width + 2)) return null;
  return (
    <div
      aria-hidden
      data-testid="playhead"
      className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 bg-accent"
      style={{ left: x }}
    />
  );
}
