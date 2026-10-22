import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import {
  analyseSamplesToEvents,
  decodeFileToMono,
  type DecodedAudio,
  type OfflineAnalysisResult,
  type OfflineStage,
} from '@/audio/offline';
import type { JamMode, VocabLevel } from '@/core';
import { draftFromAnalysis, nameFromFile, saveAnalysedSession } from '@/data/importAnalysis';
import { useSettings } from '@/state/settingsStore';
import { Button } from '../components/Button';
import { KeyBadge } from '../components/KeyBadge';
import { LevelSelector } from '../components/LevelSelector';
import { ModeToggle } from '../components/ModeToggle';
import { Switch } from '../components/Switch';
import { toast } from '../components/toastStore';
import { chordSymbol, keyLabel, pretty } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { romanNumeral } from '../lib/numeral';
import { buildChart, keyAt, keySpans, locate } from './analyze/chart';
import { ChordChart } from './analyze/ChordChart';
import { DropZone } from './analyze/DropZone';
import { audioMimeType, formatBytes, isSupportedAudio, LARGE_FILE_BYTES } from './analyze/files';
import { useAudioTime } from './analyze/useAudioTime';
import { copyChart } from './library/exportActions';
import { clockLabel } from './review/timeline';

type Phase =
  | { kind: 'idle' }
  | { kind: 'large'; file: File }
  | { kind: 'working'; stage: OfflineStage; fraction: number }
  | { kind: 'done'; result: OfflineAnalysisResult; level: VocabLevel; mode: JamMode }
  | { kind: 'error'; title: string; message: string };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError';

/** `/analyze`: key and chord chart of an audio file, offline, with a following player (§3.5). */
export function AnalyzeScreen() {
  const settings = useSettings(
    useShallow((s) => ({
      a4: s.a4,
      vocabLevel: s.vocabLevel,
      instrument: s.instrument,
      stability: s.stability,
      showSlashChords: s.showSlashChords,
      spellingFollowsKey: s.spellingFollowsKey,
    })),
  );
  const [level, setLevel] = useState<VocabLevel>(settings.vocabLevel);
  // A recorded song is a full mix: room mode down-weights vocals and other unstable partials.
  const [mode, setMode] = useState<JamMode>('room');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const decoded = useRef<DecodedAudio | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const { a4, instrument, stability, showSlashChords } = settings;
  const analyse = useCallback(
    async (audio: DecodedAudio, lvl: VocabLevel, m: JamMode) => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setPhase({ kind: 'working', stage: 'analysing', fraction: 0 });
      try {
        const result = await analyseSamplesToEvents(audio.samples, audio.sampleRate, {
          a4,
          instrument,
          stability,
          showSlashChords,
          vocabLevel: lvl,
          mode: m,
          signal: ctrl.signal,
          onProgress: (fraction, stage) => {
            if (!ctrl.signal.aborted) setPhase({ kind: 'working', stage, fraction });
          },
        });
        if (!ctrl.signal.aborted) setPhase({ kind: 'done', result, level: lvl, mode: m });
      } catch (err) {
        if (ctrl.signal.aborted || isAbort(err)) return;
        setPhase({ kind: 'error', title: 'Analysis failed', message: errorText(err) });
      }
    },
    [a4, instrument, stability, showSlashChords],
  );

  const start = async (f: File) => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    decoded.current = null;
    setFile(f);
    setPhase({ kind: 'working', stage: 'decoding', fraction: 0 });
    let audio: DecodedAudio;
    try {
      audio = await decodeFileToMono(f);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setPhase({
        kind: 'error',
        title: `Could not decode ${f.name}`,
        message:
          `${errorText(err)} The file may be damaged, or this browser cannot read the format ` +
          '(Safari has no Ogg support). mp3, m4a and wav work everywhere.',
      });
      return;
    }
    if (ctrl.signal.aborted) return;
    decoded.current = audio;
    await analyse(audio, level, mode);
  };

  const pick = (f: File) => {
    if (!isSupportedAudio(f)) {
      abort.current?.abort();
      setPhase({
        kind: 'error',
        title: 'That is not an audio file',
        message: `${f.name} is not an audio file. Drop an mp3, m4a, wav or ogg file.`,
      });
      return;
    }
    if (f.size > LARGE_FILE_BYTES) {
      abort.current?.abort();
      setPhase({ kind: 'large', file: f });
      return;
    }
    void start(f);
  };

  const changeLevel = (l: VocabLevel) => {
    setLevel(l);
    if (decoded.current && phase.kind !== 'idle') void analyse(decoded.current, l, mode);
  };
  const changeMode = (m: JamMode) => {
    setMode(m);
    if (decoded.current && phase.kind !== 'idle') void analyse(decoded.current, level, m);
  };
  const reset = () => {
    abort.current?.abort();
    decoded.current = null;
    setFile(null);
    setPhase({ kind: 'idle' });
  };

  const busy = phase.kind === 'working';
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),24px)] lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-white lg:text-3xl">Analyze a file</h1>
            <p className="text-sm text-zinc-400">
              Key and chord chart of a song, with the same detector as the jam screen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LevelSelector value={level} onChange={changeLevel} />
            <ModeToggle value={mode} onChange={changeMode} />
          </div>
        </header>

        {phase.kind === 'done' && file ? (
          <>
            <DropZone onFile={pick} compact />
            <AnalyzeResult
              key={`${file.name}:${file.size}:${file.lastModified}`}
              file={file}
              result={phase.result}
              level={phase.level}
              mode={phase.mode}
              instrument={instrument}
              spellingFollowsKey={settings.spellingFollowsKey}
              showSlash={showSlashChords}
              onReset={reset}
            />
          </>
        ) : (
          <DropZone onFile={pick} disabled={busy} />
        )}

        {phase.kind === 'working' && (
          <Progress
            stage={phase.stage}
            fraction={phase.fraction}
            name={file?.name}
            onCancel={reset}
          />
        )}

        {phase.kind === 'large' && (
          <Notice tone="warn" title={`${phase.file.name} is ${formatBytes(phase.file.size)}`}>
            <p>
              Files over {formatBytes(LARGE_FILE_BYTES)} are decoded to raw audio in memory (often
              ten times the file size), which can be slow or fail on a phone or tablet.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void start(phase.file)}>
                Analyze anyway
              </Button>
              <Button variant="ghost" onClick={reset}>
                Choose another file
              </Button>
            </div>
          </Notice>
        )}

        {phase.kind === 'error' && (
          <Notice tone="error" title={phase.title}>
            <p>{phase.message}</p>
          </Notice>
        )}
      </div>
    </div>
  );
}

function Progress({
  stage,
  fraction,
  name,
  onCancel,
}: {
  stage: OfflineStage;
  fraction: number;
  name?: string;
  onCancel(): void;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const label = stage === 'decoding' ? 'Decoding' : 'Analysing';
  return (
    <section
      aria-label="Progress"
      className="flex flex-col gap-3 rounded-2xl bg-zinc-900/40 p-5 ring-1 ring-zinc-900"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p role="status" className="text-sm text-zinc-200">
          {label}
          {name ? <span className="text-zinc-500"> {name}</span> : null}
          {stage === 'analysing' ? ` · ${pct}%` : '…'}
        </p>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stage === 'analysing' ? pct : undefined}
        className="h-2 overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          className={cx(
            'h-full rounded-full bg-violet-400 transition-[width] duration-200',
            stage === 'decoding' && 'w-1/3 animate-pulse',
          )}
          style={stage === 'analysing' ? { width: `${pct}%` } : undefined}
        />
      </div>
    </section>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'error';
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      role="alert"
      className={cx(
        'rounded-2xl p-5 text-sm ring-1',
        tone === 'error'
          ? 'bg-rose-500/10 text-rose-100 ring-rose-500/30'
          : 'bg-amber-400/10 text-amber-100 ring-amber-400/30',
      )}
    >
      <h2 className="mb-1 text-base font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}

interface AnalyzeResultProps {
  file: File;
  result: OfflineAnalysisResult;
  level: VocabLevel;
  mode: JamMode;
  instrument: 'piano' | 'guitar';
  spellingFollowsKey: boolean;
  showSlash: boolean;
  onReset(): void;
}

function AnalyzeResult({
  file,
  result,
  level,
  mode,
  instrument,
  spellingFollowsKey,
  showSlash,
  onReset,
}: AnalyzeResultProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(() => nameFromFile(file.name));
  const [keepAudio, setKeepAudio] = useState(true);
  const [saving, setSaving] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const { time, seek } = useAudioTime(audioEl);

  // The <audio> plays the dropped file through an object URL that lives as long as the view.
  useEffect(() => {
    if (!audioEl || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(file);
    audioEl.setAttribute('src', url);
    return () => {
      audioEl.pause();
      audioEl.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [audioEl, file]);

  const input = useMemo(
    () => ({
      name,
      events: result.events,
      durationSec: result.durationSec,
      mode,
      instrument,
      vocabLevel: level,
    }),
    [name, result, mode, instrument, level],
  );
  const draft = useMemo(() => draftFromAnalysis(input), [input]);
  const chart = useMemo(
    () => buildChart(draft.chords, draft.keys, result.durationSec),
    [draft, result.durationSec],
  );
  const spans = useMemo(
    () => keySpans(draft.keys, result.durationSec),
    [draft.keys, result.durationSec],
  );

  const position = locate(chart, time);
  const keyRec = keyAt(draft.keys, time);
  const key = keyRec?.key ?? null;
  const now = position?.item.chord ?? null;
  const opts = { spellingFollowsKey };

  const save = async () => {
    setSaving(true);
    try {
      const id = await saveAnalysedSession({
        ...input,
        audio: keepAudio ? { blob: file, mimeType: audioMimeType(file) } : null,
      });
      toast(`Saved “${name.trim() || 'Analyzed file'}” to the library`, {
        tone: 'success',
        durationMs: 2000,
      });
      navigate(`/review/${id}`);
    } catch (err) {
      setSaving(false);
      toast(`Could not save: ${errorText(err)}`, { tone: 'error' });
    }
  };
  const copy = async () => {
    const how = await copyChart(draft);
    toast(how === 'copied' ? 'Chord chart copied' : 'Clipboard unavailable: chart downloaded', {
      tone: 'success',
      durationMs: 1800,
    });
  };

  return (
    <div data-testid="analyze-result" className="flex flex-col gap-5">
      <section
        aria-label="Player"
        className="flex flex-col gap-4 rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <KeyBadge keyEstimate={key} spellingFollowsKey={spellingFollowsKey} className="-ml-3" />
          <div className="flex min-h-11 items-baseline gap-3" aria-live="off">
            <span className="text-xs tracking-widest text-zinc-500 uppercase">Now</span>
            <span data-testid="analyze-now" className="text-3xl font-semibold text-white">
              {now ? pretty(chordSymbol(now, key, { spellingFollowsKey, showSlash })) : '—'}
            </span>
            {now && key && (
              <span className="text-base text-zinc-400">{pretty(romanNumeral(now, key))}</span>
            )}
          </div>
          <span className="text-sm text-zinc-500 tabular-nums">
            {clockLabel(time)} / {clockLabel(result.durationSec)}
          </span>
        </div>
        <audio
          ref={setAudioEl}
          controls
          preload="auto"
          aria-label={`Play ${file.name}`}
          className="w-full [color-scheme:dark]"
        />
        {spans.length > 0 && (
          <ul aria-label="Key history" className="flex flex-wrap gap-2">
            {spans.map((s) => {
              const active = time >= s.start && time < s.end;
              return (
                <li key={s.rec.id}>
                  <button
                    type="button"
                    data-testid="key-span"
                    onClick={() => seek(s.start)}
                    className={cx(
                      'flex min-h-11 items-baseline gap-2 rounded-xl px-3 text-sm ring-1 transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-violet-300',
                      active
                        ? 'bg-violet-400/15 text-violet-100 ring-violet-300/50'
                        : 'bg-zinc-900 text-zinc-300 ring-zinc-800 hover:bg-zinc-800',
                    )}
                  >
                    <span className="font-medium">{pretty(keyLabel(s.rec.key, opts))}</span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {clockLabel(s.start)}–{clockLabel(s.end)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ChordChart
        chart={chart}
        position={position}
        onSeek={seek}
        spellingFollowsKey={spellingFollowsKey}
        showSlash={showSlash}
      />

      <section
        aria-label="Save"
        className="flex flex-col gap-3 rounded-2xl bg-zinc-900/40 p-4 ring-1 ring-zinc-900"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs tracking-widest text-zinc-500 uppercase">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded-xl bg-zinc-950 px-3 text-zinc-100 ring-1 ring-zinc-800 focus:ring-violet-300 focus:outline-none"
          />
        </label>
        <Switch
          label="Keep the audio in the library"
          description={`Review plays the song (${formatBytes(file.size)} on this device).`}
          checked={keepAudio}
          onChange={setKeepAudio}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save to library'}
          </Button>
          <Button onClick={() => void copy()} disabled={!chart.items.length}>
            Copy chart
          </Button>
          <Button variant="ghost" onClick={onReset} className="ml-auto">
            Clear
          </Button>
        </div>
      </section>
    </div>
  );
}
