import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Check,
  ChevronDown,
  Ellipsis,
  FileQuestion,
  Keyboard,
  Pencil,
  Share,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { auditionChord } from '@/app/live/audition';
import type { Chord, ChordRecord } from '@/core';
import { buildChart, chartRows, type SessionFull } from '@/data';
import { useSettings } from '@/state/settingsStore';
import { sameChord } from '@/theory';
import { Badge, Button, EmptyState, Group, Page, Row, Sheet, Switch, useFlash } from '../kit';
import { ChordLane } from '../components/ChordLane';
import { ChordPicker } from '../components/ChordPicker';
import { MarkerLane, MarkerToolbar } from '../components/MarkerLane';
import { PianoRoll } from '../components/PianoRoll';
import { ReharmPanel, type ReharmSource } from '../components/ReharmPanel';
import { buildNoteIndex } from '../components/PianoRoll.logic';
import { toast } from '../components/toastStore';
import { keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { MARKER_LABEL } from '../lib/markers';
import type { MarkChoice } from './review/MarkMenu';
import { useSync } from '@/sync/store';
import { DownloadItems, ShareLinkItem } from './library/ShareItems';
import { runExport, shareChart } from './library/exportActions';
import { GRAY_LINK } from './library/linkStyles';
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

/**
 * `/review/:id` (DESIGN.md §3.2): the chord chart, playback, Mark and Share up front; the chord
 * lane, marker lane and piano roll behind one Timeline disclosure.
 */
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
  // The timeline is a studio tool: open on a wide screen, one tap away on a phone.
  const roomy = useMediaQuery('(min-width: 768px)');
  const [timelineChoice, setTimelineChoice] = useState<boolean | null>(null);
  const timelineOpen = timelineChoice ?? roomy;
  const timelineId = useId();
  const pianoLabel = useId();
  const [copied, flashCopied] = useFlash();
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

  // The folded chart; the lanes, the header and the chord editor use its keys (no wobbles
  // under ten seconds, no parallel-key detours), so everything on the page agrees with it.
  const chart = useMemo(
    () => buildChart({ chords, keys, markers, durationSec: session.durationSec }),
    [chords, keys, markers, session.durationSec],
  );
  const chartKeys = useMemo(
    () => chart.keys.map((k) => ({ t: k.start, key: k.key })),
    [chart.keys],
  );
  const keyList = chart.keys
    .map((k) => k.key)
    .filter((k, i, a) => a.findIndex((x) => x.tonic === k.tonic && x.mode === k.mode) === i);

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
  if (follow && width > 0 && (time < viewport.start || time > viewport.start + visible * 0.92)) {
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

  // Chord at the playhead (for Edit chord and the piano roll's label).
  const currentIdx = indexAt(chords, time);
  const currentRec = currentIdx >= 0 ? chords[currentIdx] : null;
  const current = currentRec
    ? chordText(currentRec, keyAtTime(chartKeys, time), {
        spellingFollowsKey: settings.spellingFollowsKey,
        showSlash: settings.showSlashChords,
      })
    : null;
  const chordTimes = useMemo(() => chords.map((c) => c.t), [chords]);

  // Chord editing.
  const [editing, setEditing] = useState<ChordRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const sameAsEditing = editing?.chord
    ? chords.filter(
        (c) =>
          c.chord &&
          c.chord.root === editing.chord!.root &&
          c.chord.quality === editing.chord!.quality,
      ).length
    : 1;
  const saveChord = async (chord: ChordRecord['chord'], all: boolean) => {
    if (!editing) return;
    setSaving(true);
    try {
      if (all && editing.chord) {
        const n = await api.updateChordsLike(editing.chord, chord);
        setEditing(null);
        toast(`${n} chords updated`, { tone: 'success', durationMs: 1500 });
      } else {
        await api.updateChord(editing, chord);
        setEditing(null);
        toast('Chord updated', { tone: 'success', durationMs: 1500 });
      }
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
  const addMarker = ({ kind, label }: MarkChoice, t: number) =>
    run(
      api.addMarker(kind, t, label).then((m) => {
        setSelectedMarker(m.id);
        toast(`${label ?? MARKER_LABEL[kind]} at ${clockLabel(m.t)}`, { durationMs: 1500 });
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
      bookmark: () => void addMarker({ kind: 'bookmark' }, controller.position()),
      zoom,
    },
    editing === null,
  );

  const editingKey = editing ? keyAtTime(chartKeys, editing.t) : null;

  // Reharmonize: the chart's loops (up to three), or up to four chords from the playhead.
  const reharmSources = useMemo<ReharmSource[]>(() => {
    const out: ReharmSource[] = [];
    chartRows(chart).forEach(({ row, key }) => {
      for (const seg of row) {
        if (seg.repeat < 2 || !key || out.length >= 3) continue;
        const id = seg.chords.map((c) => `${c.root}:${c.quality}`).join(' ');
        if (out.some((o) => o.id === id)) continue;
        out.push({ id, label: `Loop ${out.length + 1} ×${seg.repeat}`, chords: seg.chords, key });
      }
    });
    return out;
  }, [chart]);
  const captureAtPlayhead = useCallback(() => {
    const start = Math.max(0, indexAt(chords, controller.position()));
    const picked: Chord[] = [];
    for (let i = start; i < chords.length && picked.length < 4; i++) {
      const c = chords[i].chord;
      if (c && !sameChord(picked[picked.length - 1], c)) picked.push(c);
    }
    const k = keyAtTime(chartKeys, chords[start]?.t ?? 0);
    if (!picked.length || !k) return null;
    return { chords: picked, key: { tonic: k.tonic, mode: k.mode } };
  }, [chords, chartKeys, controller]);

  const getFull = useCallback(async () => full, [full]);
  // The share sheet is its own feedback; a copy says so on the button itself.
  const share = () =>
    void runExport(getFull, async (f) => {
      const how = await shareChart(f);
      if (how === 'copied') flashCopied();
      else if (how === 'downloaded') toast('Chord chart downloaded', { tone: 'success' });
    })();
  const openShareLink = () => {
    if (!syncUser) {
      toast('Sign in under Settings → Account & sync to share a link.', { durationMs: 3500 });
    } else setShareOpen(true);
  };

  const counts = [
    `${session.summary?.chordCount ?? chords.filter((c) => c.chord).length} chords`,
    `${markers.filter((m) => m.kind === 'bookmark').length} bookmarks`,
  ].join(' · ');

  return (
    <>
      <Page
        back={{ to: '/library', label: 'Library' }}
        title={
          <NameField
            value={session.name}
            onCommit={(name) => run(api.rename(name), 'rename the session')}
            className="-ml-2 w-[calc(100%+1rem)] font-bold"
          />
        }
        subtitle={
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
        }
        actions={
          <>
            {copied ? (
              <Button
                variant="plain"
                leading={<Check className="size-5" aria-hidden />}
                onClick={share}
                className="px-2"
              >
                Copied
              </Button>
            ) : (
              <Button
                icon
                variant="plain"
                aria-label="Share"
                title="Share the chord chart"
                onClick={share}
              >
                <Share className="size-5" aria-hidden />
              </Button>
            )}
            <span role="status" className="sr-only">
              {copied ? 'Chord chart copied' : ''}
            </span>
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
      >
        <div className="flex min-w-0 flex-col gap-5 px-4">
          <ChartCard
            full={full}
            chart={chart}
            spellingFollowsKey={settings.spellingFollowsKey}
            showSlash={settings.showSlashChords}
            time={time}
            onSeek={seek}
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
              piano={piano}
              onToggle={toggle}
              onSeek={seek}
              onRate={(r) => controller.setRate(r)}
            />

            <MarkerToolbar
              time={Math.min(duration, time)}
              selected={markers.find((m) => m.id === selectedMarker) ?? null}
              onAdd={(kind, t) => void addMarker(kind, t)}
              onDelete={deleteMarker}
              onChangeKind={(mid, kind) =>
                void run(api.changeMarkerKind(mid, kind), 'change the marker')
              }
              onDeselect={() => setSelectedMarker(null)}
            >
              {currentRec && (
                <Button
                  variant="gray"
                  size="sm"
                  leading={<Pencil className="size-3.5" aria-hidden />}
                  onClick={() => setEditing(currentRec)}
                >
                  Edit chord
                </Button>
              )}
            </MarkerToolbar>
          </section>

          <TagEditor
            tags={session.tags}
            onChange={(tags) => run(api.setTags(tags), 'save the tags')}
          />

          <section aria-label="Timeline" className="overflow-hidden rounded-card bg-surface">
            <h2>
              <button
                type="button"
                aria-expanded={timelineOpen}
                aria-controls={timelineId}
                onClick={() => setTimelineChoice(!timelineOpen)}
                className="flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 hover:bg-fill-4 active:bg-fill-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-headline text-label">Timeline</span>
                  <span className="block text-footnote text-label-2">
                    {hasMidi ? 'Chords, marks and notes by time' : 'Chords and marks by time'}
                  </span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={cx(
                    'size-4 shrink-0 text-label-3 transition-transform duration-200 ease-out-expo',
                    timelineOpen && 'rotate-180',
                  )}
                />
              </button>
            </h2>

            {/* Kept mounted while closed so the lanes keep their viewport and listeners. */}
            <div id={timelineId} hidden={!timelineOpen} className="hairline-t">
              <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
                <div className="-ml-2 flex items-center" role="group" aria-label="Zoom">
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
                {hasMidi && (
                  <label className="ml-auto flex min-h-11 items-center gap-2">
                    <span id={pianoLabel} className="text-subhead text-label">
                      Piano sound
                    </span>
                    <Switch
                      checked={pianoOn}
                      onChange={(on) => controller.setPianoOn(on)}
                      aria-labelledby={pianoLabel}
                    />
                  </label>
                )}
              </div>

              <div ref={lanes} className="hairline-t flex flex-col">
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
                    keys={chartKeys}
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

              <p className="hairline-t px-4 py-2.5 text-footnote text-label-2">
                <span className="tabular">{counts}</span>
                {!touch && (
                  <>
                    {' · '}Right-click a chord to fix it.{' '}
                    <button
                      type="button"
                      onClick={() => setShortcutsOpen(true)}
                      className="text-accent hover:underline"
                    >
                      Shortcuts
                    </button>
                  </>
                )}
              </p>
            </div>
          </section>

          <ReharmPanel
            sources={reharmSources}
            capture={captureAtPlayhead}
            onAudition={auditionChord}
            spellingFollowsKey={settings.spellingFollowsKey}
            showSlash={settings.showSlashChords}
          />
        </div>
      </Page>
      <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} sessionId={session.id} />

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
          sameCount={sameAsEditing}
          onClose={() => setEditing(null)}
          onSave={(c, all) => void saveChord(c, all)}
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
    </>
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
