import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Check, ChevronRight, Lightbulb, Mic, Play, Square, Usb } from 'lucide-react';
import { clock, MIN_DISPLAY_CONFIDENCE } from '@/core';
import type { Chord, JamMode, MarkerKind, VocabLevel } from '@/core';
import { jamStore, useJamStore } from '@/state/jamStore';
import { useInputStore } from '@/state/inputStore';
import { useSettings } from '@/state/settingsStore';
import { auditionChord } from '@/app/live/audition';
import { ChordDisplay } from '../components/ChordDisplay';
import { KeyBadge } from '../components/KeyBadge';
import { Piano } from '../components/Piano';
import { Timeline } from '../components/Timeline';
import { toast } from '../components/toastStore';
import { Badge, Button, Meter, Segmented } from '../kit';
import { cx } from '../lib/cx';
import { MARKER_LABEL } from '../lib/markers';
import { playNotes } from '../lib/playNotes';
import { suggestNext } from '../lib/suggest';
import { useMediaQuery } from '../lib/useMediaQuery';
import { JamInspector } from './jam/JamInspector';
import { JamOptions } from './jam/JamOptions';
import { MODE_OPTIONS } from './jam/labels';
import { MarkMenu } from './jam/MarkMenu';
import { useInspectorPref } from './jam/useInspectorPref';
import { useJamInput } from './jam/useJamInput';
import { useJamShortcuts } from './jam/useJamShortcuts';
import { useStoredToggle } from './jam/useStoredToggle';

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useElapsed(listening: boolean, started: number | null) {
  const [now, setNow] = useState(clock.now);
  useEffect(() => {
    if (!listening || started === null) return;
    const timer = setInterval(() => setNow(clock.now()), 1000);
    return () => clearInterval(timer);
  }, [listening, started]);
  return started === null ? 0 : Math.max(0, now - started);
}

/** A quiet-input nudge waits long enough for the player to reach the keys. */
function useQuietInput(listening: boolean, level: number): boolean {
  const [quiet, setQuiet] = useState(false);
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!listening || level > 0.06) {
      since.current = null;
      setQuiet(false);
      return;
    }
    since.current ??= Date.now();
    const timer = setTimeout(
      () => {
        if (since.current !== null && Date.now() - since.current >= 4000) setQuiet(true);
      },
      Math.max(0, 4000 - (Date.now() - since.current)),
    );
    return () => clearTimeout(timer);
  }, [listening, level]);
  return quiet;
}

/** Listen first. Input choices and musical helpers stay one deliberate step away. */
export function JamScreen() {
  const jam = useJamStore(
    useShallow((s) => ({
      status: s.status,
      error: s.error,
      source: s.source,
      currentChord: s.currentChord,
      confidence: s.confidence,
      keyEstimate: s.key,
      keyHistory: s.keyHistory,
      timeline: s.timeline,
      markers: s.markers,
      activePitchClasses: s.activePitchClasses,
      activeMidiNotes: s.activeMidiNotes,
      level: s.level,
      recordAudio: s.recordAudio,
      sessionStart: s.sessionStart,
    })),
  );
  const settings = useSettings(
    useShallow((s) => ({
      vocabLevel: s.vocabLevel,
      mode: s.mode,
      sensitivity: s.sensitivity,
      audioDeviceId: s.audioDeviceId,
      showSlashChords: s.showSlashChords,
      spellingFollowsKey: s.spellingFollowsKey,
      recordAudioByDefault: s.recordAudioByDefault,
      update: s.update,
    })),
  );
  const devices = useInputStore((s) => s.audioDevices);
  const input = useJamInput();
  const wide = useMediaQuery('(min-width: 1024px)', true);
  const phone = !useMediaQuery('(min-width: 640px)', true);
  // Ideas docks at the side only where the centred chord column stays clear of it.
  const sideIdeas = useMediaQuery('(min-width: 1440px)', true);
  const [pianoVisible, togglePiano] = useStoredToggle('keel.ui.piano', false);
  const inspector = useInspectorPref();
  const listening = jam.status === 'listening';
  const starting = jam.status === 'starting';
  const elapsed = useElapsed(listening, jam.sessionStart);
  const quiet = useQuietInput(listening && !input.mock && jam.source !== 'midi', jam.level);
  const stopped = input.finished && !listening && !starting;
  const hasChord = jam.currentChord && jam.confidence >= MIN_DISPLAY_CONFIDENCE;
  // Compact widths: Ideas is a half-height sheet and the screen keeps chord + Finish above it.
  const halfIdeas = inspector.open && !sideIdeas;
  const inputLabel =
    jam.source === 'midi' && listening
      ? 'USB MIDI'
      : (devices.find((d) => d.id === settings.audioDeviceId)?.label ?? 'Device microphone');

  useEffect(() => {
    if (jamStore.getState().status !== 'listening')
      jamStore.getState().setRecordAudio(settings.recordAudioByDefault);
  }, [settings.recordAudioByDefault]);

  const { start, stop } = input;
  const toggleListening = useCallback(() => {
    if (input.saving) return;
    const status = jamStore.getState().status;
    if (status === 'listening') void stop();
    else if (status !== 'starting') void start();
  }, [start, stop, input.saving]);
  const addMarker = useCallback((kind: MarkerKind) => {
    const marker = jamStore.getState().addMarker(kind);
    if (marker) toast(`${MARKER_LABEL[kind]} at ${formatTime(marker.t)}`, { durationMs: 1600 });
  }, []);
  const audition = useCallback((chord: Chord) => auditionChord(chord), []);
  const setMode = (mode: JamMode) => settings.update({ mode });
  useJamShortcuts({
    toggleListening,
    bookmark: () => jamStore.getState().status === 'listening' && addMarker('bookmark'),
    setLevel: (vocabLevel: VocabLevel) => settings.update({ vocabLevel }),
    togglePiano,
    toggleMode: () => setMode(settings.mode === 'solo' ? 'room' : 'solo'),
    toggleInspector: () => inspector.setOpen(!inspector.open),
    showNext: () => inspector.toggleTab('next'),
    showScales: () => inspector.toggleTab('scales'),
    showVoicings: () => inspector.toggleTab('voicings'),
    showModulate: () => inspector.toggleTab('keys'),
  });
  const recent = useMemo(
    () => jam.timeline.slice(-4).flatMap((r) => (r.chord ? [r.chord] : [])),
    [jam.timeline],
  );
  const suggestions = useMemo(
    () => suggestNext(jam.keyEstimate, recent, settings.vocabLevel),
    [jam.keyEstimate, recent, settings.vocabLevel],
  );
  const options = (compact: boolean) => (
    <JamOptions
      compact={compact}
      vocabLevel={settings.vocabLevel}
      onVocabLevel={(vocabLevel) => settings.update({ vocabLevel })}
      mode={settings.mode}
      onMode={setMode}
      sensitivity={settings.sensitivity}
      onSensitivity={(sensitivity) => settings.update({ sensitivity })}
      recordAudio={jam.recordAudio}
      recordingLocked={listening || starting || input.mock}
      onRecordAudio={(on) => jamStore.getState().setRecordAudio(on)}
      pianoVisible={pianoVisible}
      onPianoVisible={togglePiano}
      canShowPiano={!phone}
    />
  );
  const timeline = (live: boolean) => (
    <Timeline
      align={live ? 'start' : 'center'}
      timeline={jam.timeline}
      keyHistory={jam.keyHistory}
      markers={live ? jam.markers : undefined}
      onAudition={audition}
      showSlash={settings.showSlashChords}
      spellingFollowsKey={settings.spellingFollowsKey}
    />
  );

  return (
    <div
      className={cx(
        'flex h-full flex-col overflow-y-auto',
        // Room for the half-height Ideas sheet (below lg it also covers the tab bar).
        halfIdeas && 'pb-[calc(min(42dvh,420px)-3.75rem)] lg:pb-[min(42dvh,420px)]',
      )}
    >
      <header className="mx-auto flex w-full max-w-[900px] items-center justify-between gap-3 px-6 py-5 sm:px-10 sm:py-7">
        <h1 className="text-title-2 font-semibold tracking-tight">Listen</h1>
        {listening || starting ? (
          <div className="flex items-center gap-2 text-subhead text-label-2">
            {input.mock ? (
              <Badge>Demo</Badge>
            ) : (
              <>
                <span className="size-2 rounded-full bg-live" aria-hidden />
                <span>{starting ? 'Connecting…' : 'Listening'}</span>
              </>
            )}
            {listening && (
              <time className="ml-1 tabular" aria-label="Session duration">
                {formatTime(elapsed)}
              </time>
            )}
          </div>
        ) : (
          input.mock && <Badge>Demo</Badge>
        )}
      </header>

      {/* One centred column for idle, listening and finished; Ideas overlays it, never shifts it. */}
      <main
        className={cx(
          'mx-auto flex w-full max-w-[900px] flex-1 flex-col px-6 sm:px-10',
          halfIdeas ? 'pb-3' : 'pb-8 sm:pb-10',
        )}
      >
        {!listening && !starting && !stopped && !input.saving ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-20">
            <h2 className="max-w-lg text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance">
              See what you’re playing.
            </h2>
            <p className="mt-4 text-body text-label-2 sm:text-title-3">
              {input.mock
                ? 'A scripted progression. Nothing is saved.'
                : 'Chords and key, as you play.'}
            </p>
            {jam.status === 'error' && jam.error && (
              <p role="alert" className="mt-6 max-w-md text-subhead leading-relaxed text-live">
                {jam.error}
              </p>
            )}
            <Button
              className="mt-9 min-w-52"
              variant="filled"
              size="lg"
              round
              leading={
                input.mock ? (
                  <Play className="size-5 fill-current" aria-hidden />
                ) : (
                  <Mic className="size-5" aria-hidden />
                )
              }
              onClick={() => void start()}
            >
              {input.mock ? 'Start demo' : jam.status === 'error' ? 'Try again' : 'Start listening'}
            </Button>
            {input.mock ? (
              <Button className="mt-2" variant="plain" onClick={() => void input.startLive()}>
                Use my microphone
              </Button>
            ) : (
              <Button
                className="mt-2"
                variant="plain"
                onClick={input.startDemo}
                leading={<Play className="size-3.5" aria-hidden />}
              >
                Try a demo
              </Button>
            )}
            <div className="mt-8 flex items-center gap-1">
              <Segmented
                aria-label="Listen to"
                value={settings.mode}
                onChange={setMode}
                options={MODE_OPTIONS}
              />
              {options(true)}
            </div>
            {!input.mock && (
              <p className="mt-6 text-footnote text-label-2">Audio stays on this device.</p>
            )}
          </div>
        ) : stopped || input.saving ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-16">
            {input.saved && (
              <span className="mb-5 flex size-12 items-center justify-center rounded-full bg-ok/12 text-ok">
                <Check className="size-6" aria-hidden />
              </span>
            )}
            <h2 className="text-[clamp(2rem,4vw,3rem)] leading-tight font-semibold tracking-[-0.03em]">
              {input.saving
                ? 'Saving your jam…'
                : input.mock
                  ? 'That’s the idea.'
                  : input.saveError
                    ? 'Your jam couldn’t be saved.'
                    : input.saved
                      ? 'Your jam is saved.'
                      : 'Nothing was heard.'}
            </h2>
            {!input.saving && (
              <p
                role={input.saveError ? 'alert' : 'status'}
                className="mt-4 max-w-md text-body leading-relaxed text-label-2"
              >
                {input.mock
                  ? 'Now try your own instrument.'
                  : (input.saveError ??
                    (input.saved
                      ? `“${input.saved.name}” is in your Library.`
                      : 'Nothing was saved. Move closer to your instrument and try again.'))}
              </p>
            )}
            {!input.saving && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {input.saved && (
                  <Link
                    to={`/review/${input.saved.id}`}
                    className="inline-flex min-h-13 items-center gap-1 rounded-full bg-action pr-5 pl-6 text-body font-semibold text-accent-fg transition-[filter] hover:brightness-110"
                  >
                    Open session <ChevronRight className="size-5" aria-hidden />
                  </Link>
                )}
                <Button
                  variant={input.saved ? 'gray' : 'filled'}
                  round
                  size="lg"
                  onClick={() => void input.startLive()}
                >
                  {input.mock ? 'Start listening' : 'Start a new jam'}
                </Button>
                {input.mock && (
                  <Button variant="plain" size="lg" onClick={input.startDemo}>
                    Play demo again
                  </Button>
                )}
              </div>
            )}
            {jam.timeline.length > 0 && !input.saveError && (
              <div className="mt-9 w-full hairline-t pt-5">{timeline(false)}</div>
            )}
          </div>
        ) : (
          <>
            <div className="flex min-h-10 items-center justify-center gap-2 text-subhead text-label-2">
              {input.mock ? (
                <span>Example progression · microphone off</span>
              ) : (
                <>
                  {jam.source === 'midi' ? (
                    <Usb className="size-4" aria-hidden />
                  ) : (
                    <Mic className="size-4" aria-hidden />
                  )}
                  <span className="max-w-48 truncate">{inputLabel}</span>
                  <Meter level={jam.level} active={listening} bars={7} />
                </>
              )}
            </div>
            <div
              className={cx(
                'flex flex-1 flex-col items-center justify-center',
                halfIdeas ? 'py-2' : 'min-h-[260px] py-8 sm:min-h-[340px] sm:py-10',
              )}
            >
              {hasChord ? (
                <>
                  <ChordDisplay
                    details={false}
                    compact={halfIdeas}
                    chord={jam.currentChord}
                    confidence={jam.confidence}
                    keyContext={jam.keyEstimate}
                    showSlash={settings.showSlashChords}
                    spellingFollowsKey={settings.spellingFollowsKey}
                  />
                  <KeyBadge
                    primaryOnly
                    keyEstimate={jam.keyEstimate}
                    spellingFollowsKey={settings.spellingFollowsKey}
                    className="mt-3"
                  />
                </>
              ) : (
                <div className="max-w-md text-center">
                  <h2 className="text-title-1 font-semibold tracking-tight">
                    {starting
                      ? 'Connecting your instrument…'
                      : quiet
                        ? 'A little closer.'
                        : 'Play a chord.'}
                  </h2>
                  <p className="mt-3 text-body leading-relaxed text-label-2">
                    {starting
                      ? 'Allow microphone access if your browser asks.'
                      : quiet
                        ? 'Move your device near the instrument, or raise sensitivity in Listening options.'
                        : 'Hold it briefly. Your chord and key will appear here.'}
                  </p>
                </div>
              )}
              {quiet && hasChord && (
                <p role="status" className="mt-5 max-w-sm text-center text-subhead text-label-2">
                  Can’t hear much. Move closer, or raise sensitivity in Listening options.
                </p>
              )}
              {pianoVisible && listening && !phone && !halfIdeas && (
                <Piano
                  keys={wide ? 88 : 61}
                  activePitchClasses={jam.activePitchClasses}
                  activeMidiNotes={jam.activeMidiNotes}
                  className="mt-8 w-full"
                />
              )}
            </div>
            {jam.timeline.length > 0 && !halfIdeas && (
              <section
                aria-label="Your progression"
                className={cx(
                  'hairline-t py-4',
                  // Keep the newest chords clear of the side Ideas panel.
                  inspector.open && 'pr-[max(0px,calc(930px-50vw))]',
                )}
              >
                {timeline(true)}
              </section>
            )}
            <div className={cx('flex flex-col items-center gap-4', halfIdeas ? 'pt-2' : 'pt-5')}>
              <div className="flex w-full flex-wrap items-center justify-center gap-3">
                <Button
                  variant="filled"
                  size="lg"
                  round
                  className="min-w-48"
                  loading={starting}
                  leading={<Square className="size-4 fill-current" aria-hidden />}
                  onClick={() => void stop()}
                >
                  {starting ? 'Connecting…' : input.mock ? 'Stop demo' : 'Finish & save'}
                </Button>
                {listening && <MarkMenu onMark={addMarker} />}
              </div>
              {!halfIdeas && (
                <div className="flex flex-wrap items-center justify-center gap-x-3">
                  {options(false)}
                  {listening && (
                    <Button
                      variant="plain"
                      leading={<Lightbulb className="size-4" aria-hidden />}
                      onClick={() => inspector.setOpen(!inspector.open)}
                      pressed={inspector.open}
                    >
                      Ideas
                    </Button>
                  )}
                </div>
              )}
              {input.mock && !halfIdeas && (
                <p className="text-footnote text-label-2">Demo sessions aren’t saved.</p>
              )}
            </div>
          </>
        )}
      </main>
      <JamInspector
        open={inspector.open}
        onClose={() => inspector.setOpen(false)}
        tab={inspector.tab}
        onTab={inspector.setTab}
        chord={jam.currentChord}
        confidence={jam.confidence}
        keyContext={jam.keyEstimate}
        level={settings.vocabLevel}
        suggestions={suggestions}
        spellingFollowsKey={settings.spellingFollowsKey}
        onAudition={audition}
        onPlayNotes={playNotes}
        layout={sideIdeas ? 'side' : 'half'}
      />
    </div>
  );
}
