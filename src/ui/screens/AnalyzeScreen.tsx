import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, Pause, Play } from 'lucide-react';
import {
  analyseSamplesToEvents,
  decodeFileToMono,
  type DecodedAudio,
  type OfflineAnalysisResult,
  type OfflineStage,
} from '@/audio/offline';
import type { JamMode, KeyEstimate, VocabLevel } from '@/core';
import { buildChart, chartNumeral, chartSymbol } from '@/data';
import { draftFromAnalysis, nameFromFile, saveAnalysedSession } from '@/data/importAnalysis';
import { useSettings } from '@/state/settingsStore';
import { KeyBadge } from '../components/KeyBadge';
import { toast } from '../components/toastStore';
import { Button, Group, Page, Row, Segmented, Slider, Switch } from '../kit';
import { ChordChart } from '../components/ChordChart';
import { keyLabel, pretty, sameKey } from '../lib/chordLabel';
import { cx } from '../lib/cx';
import { useMediaQuery } from '../lib/useMediaQuery';
import { DropZone } from './analyze/DropZone';
import { audioMimeType, formatBytes, isSupportedAudio, LARGE_FILE_BYTES } from './analyze/files';
import { useAudioTime } from './analyze/useAudioTime';
import { copyChart } from './library/exportActions';
import { keyAtTime } from './review/chordText';
import { clockLabel, indexAt } from './review/timeline';
import { LEVEL_OPTIONS, MODE_OPTIONS } from './settings/labels';

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
  // Decoding is asynchronous: use the latest selections when the samples are ready.
  const selectedOptions = useRef({ level, mode });
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
    await analyse(audio, selectedOptions.current.level, selectedOptions.current.mode);
  };

  const pick = (f: File) => {
    // A pending file warning or error must never re-analyse the previous file.
    decoded.current = null;
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
    selectedOptions.current.level = l;
    setLevel(l);
    if (decoded.current && phase.kind !== 'idle') void analyse(decoded.current, l, mode);
  };
  const changeMode = (m: JamMode) => {
    selectedOptions.current.mode = m;
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
  const options = (
    <AnalyzeOptions level={level} mode={mode} onLevel={changeLevel} onMode={changeMode} />
  );
  return (
    <Page
      title="Analyze a song"
      subtitle="Key and chords from a song"
      back={{ to: '/tools', label: 'Tools' }}
    >
      <div className="flex flex-col gap-6 px-4 pt-2">
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
              options={options}
              onReset={reset}
            />
          </>
        ) : (
          <>
            <DropZone onFile={pick} disabled={busy} />

            {phase.kind === 'working' && (
              <Progress
                stage={phase.stage}
                fraction={phase.fraction}
                name={file?.name}
                onCancel={reset}
              />
            )}

            {phase.kind === 'large' && (
              <Notice
                tone="warn"
                title={`${phase.file.name} is ${formatBytes(phase.file.size)}`}
                actions={
                  <>
                    <Button variant="filled" size="sm" onClick={() => void start(phase.file)}>
                      Analyze anyway
                    </Button>
                    <Button variant="plain" size="sm" onClick={reset}>
                      Choose another file
                    </Button>
                  </>
                }
              >
                Files over {formatBytes(LARGE_FILE_BYTES)} are decoded to raw audio in memory (often
                ten times the file size), which can be slow or fail on a phone or tablet.
              </Notice>
            )}

            {phase.kind === 'error' && (
              <Notice tone="error" title={phase.title}>
                {phase.message}
              </Notice>
            )}

            {options}
          </>
        )}
      </div>
    </Page>
  );
}

function AnalyzeOptions({
  level,
  mode,
  onLevel,
  onMode,
}: {
  level: VocabLevel;
  mode: JamMode;
  onLevel(l: VocabLevel): void;
  onMode(m: JamMode): void;
}) {
  // On a phone the two segmented controls need the full row width.
  const narrow = useMediaQuery('(max-width: 479px)');
  return (
    <Group
      title="Options"
      footer="With a band suits a full mix with vocals; Just me suits a single instrument. Changing either analyzes the file again."
    >
      <Row
        stacked={narrow}
        label="Chord detail"
        accessory={
          <Segmented<VocabLevel>
            fill={narrow}
            aria-label="Chord detail"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={onLevel}
          />
        }
      />
      <Row
        stacked={narrow}
        label="Listening mode"
        accessory={
          <Segmented<JamMode>
            fill={narrow}
            aria-label="Listening mode"
            options={MODE_OPTIONS}
            value={mode}
            onChange={onMode}
          />
        }
      />
    </Group>
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
  const label = stage === 'decoding' ? 'Decoding' : 'Analyzing';
  return (
    <section aria-label="Progress" className="flex flex-col gap-2 px-1">
      <div className="flex items-center justify-between gap-4">
        <p role="status" className="min-w-0 truncate text-subhead text-label">
          {label}
          {name ? <span className="text-label-2"> {name}</span> : null}
          {stage === 'analysing' ? ` · ${pct}%` : '…'}
        </p>
        <Button variant="plain" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stage === 'analysing' ? pct : undefined}
        className="h-1 overflow-hidden rounded-full bg-fill-3"
      >
        <div
          className={cx(
            'h-full rounded-full bg-accent transition-[width] duration-200',
            stage === 'decoding' && 'anim-pulse-soft w-1/3',
          )}
          style={stage === 'analysing' ? { width: `${pct}%` } : undefined}
        />
      </div>
    </section>
  );
}

/** Inline tinted row for a warning or an error (announced, but not a modal alert). */
function Notice({
  tone,
  title,
  children,
  actions,
}: {
  tone: 'warn' | 'error';
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      role="alert"
      className={cx(
        'flex items-start gap-3 rounded-cell px-4 py-3',
        tone === 'error' ? 'bg-live/12' : 'bg-warn/12',
      )}
    >
      <AlertCircle
        aria-hidden
        className={cx('mt-0.5 size-5 shrink-0', tone === 'error' ? 'text-live' : 'text-warn')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2
          className={cx('text-subhead font-semibold', tone === 'error' ? 'text-live' : 'text-warn')}
        >
          {title}
        </h2>
        <p className="text-subhead text-label-2">{children}</p>
        {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
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
  /** Chord detail + mode controls, shown between the chart and the save actions. */
  options: ReactNode;
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
  options,
  onReset,
}: AnalyzeResultProps) {
  const navigate = useNavigate();
  const [name, setName] = useState(() => nameFromFile(file.name));
  const [keepAudio, setKeepAudio] = useState(true);
  const [saving, setSaving] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const { time, playing, seek } = useAudioTime(audioEl);

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
  // The same folded chart as Review and the shared text: key by time, wobbles under 10 s hidden.
  const chart = useMemo(
    () => buildChart({ ...draft, durationSec: result.durationSec }),
    [draft, result.durationSec],
  );
  // The headline is the chart's key; its last estimate carries the confidence and alternatives.
  const mainKey = useMemo((): KeyEstimate | null => {
    let est: KeyEstimate | null = null;
    for (const e of result.events) if (e.type === 'key' && sameKey(e.key, chart.key)) est = e.key;
    return est;
  }, [result.events, chart.key]);
  // The second key by time, the same one the key chips show, or none.
  const secondKey = useMemo(() => {
    const totals = new Map<string, { key: (typeof chart.keys)[number]['key']; s: number }>();
    for (const k of chart.keys) {
      const id = `${k.key.tonic}:${k.key.mode}`;
      const e = totals.get(id) ?? { key: k.key, s: 0 };
      e.s += k.end - k.start;
      totals.set(id, e);
    }
    return [...totals.values()].sort((a, b) => b.s - a.s)[1]?.key ?? null;
  }, [chart]);
  const i = indexAt(draft.chords, time);
  const rec = i >= 0 ? draft.chords[i] : null;
  const key = keyAtTime(
    chart.keys.map((k) => ({ t: k.start, key: k.key })),
    time,
  );
  const now = rec?.chord ?? null;
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
  const toggle = () => {
    if (!audioEl) return;
    if (audioEl.paused) void audioEl.play()?.catch(() => {});
    else audioEl.pause();
  };
  const copy = async () => {
    const how = await copyChart(draft);
    toast(how === 'copied' ? 'Chord chart copied' : 'Clipboard unavailable: chart downloaded', {
      tone: 'success',
      durationMs: 1800,
    });
  };

  const nameId = useId();
  return (
    <div data-testid="analyze-result" className="flex flex-col gap-6">
      <section aria-label="Player" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <KeyBadge
              keyEstimate={mainKey}
              primaryOnly
              spellingFollowsKey={spellingFollowsKey}
              className="-ml-3"
            />
            {secondKey && (
              <span data-testid="analyze-second-key" className="text-headline text-label-2">
                and {pretty(keyLabel(secondKey, opts))}
              </span>
            )}
          </div>
          <div className="flex min-h-11 items-baseline gap-2.5" aria-live="off">
            <span className="text-footnote font-medium tracking-wide text-label-3 uppercase">
              Now
            </span>
            <span data-testid="analyze-now" className="text-title-1 font-bold text-label">
              {now ? chartSymbol(now, key, { spellingFollowsKey, showSlash }) : '—'}
            </span>
            {now && key && (
              <span className="text-callout font-medium text-accent">{chartNumeral(now, key)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-card bg-surface px-3 py-2.5">
          <Button
            variant="filled"
            icon
            round
            aria-label={playing ? `Pause ${file.name}` : `Play ${file.name}`}
            onClick={toggle}
          >
            {playing ? (
              <Pause className="size-5 fill-current" aria-hidden />
            ) : (
              <Play className="ml-0.5 size-5 fill-current" aria-hidden />
            )}
          </Button>
          <span className="w-11 text-right text-footnote text-label-2 tabular" aria-hidden>
            {clockLabel(time)}
          </span>
          <Slider
            aria-label="Seek"
            aria-valuetext={`${clockLabel(time)} of ${clockLabel(result.durationSec)}`}
            className="min-w-0 flex-1"
            min={0}
            max={Math.max(0.1, result.durationSec)}
            step={0.1}
            value={Math.min(time, result.durationSec)}
            onChange={seek}
          />
          <span className="w-11 text-footnote text-label-3 tabular" aria-hidden>
            {clockLabel(result.durationSec)}
          </span>
          {/* Playback engine only; the row above is its interface. */}
          <audio ref={setAudioEl} preload="auto" className="hidden" />
        </div>

        {chart.keys.length > 1 && (
          <ul aria-label="Key history" className="flex flex-wrap gap-1.5">
            {chart.keys.map((s) => (
              <li key={s.start}>
                <KeySpanButton
                  label={pretty(keyLabel(s.key, opts))}
                  range={`${clockLabel(s.start)}–${clockLabel(s.end)}`}
                  active={time >= s.start && time < s.end}
                  onClick={() => seek(s.start)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {chart.parts.length ? (
        <ChordChart
          chart={chart}
          time={time}
          onSeek={seek}
          spellingFollowsKey={spellingFollowsKey}
          showSlash={showSlash}
          className="rounded-card bg-surface px-4 py-3"
        />
      ) : (
        <p className="rounded-card bg-surface px-4 py-4 text-subhead text-label-2">
          No chords found. The file may be silent, mostly drums or speech, or very quiet.
        </p>
      )}

      {options}

      <Group title="Save">
        <Row
          label={<label htmlFor={nameId}>Name</label>}
          accessory={
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-48 rounded-[8px] bg-fill-3 px-2.5 text-right text-body text-label sm:w-64"
            />
          }
        />
        <Row
          label="Keep the audio in the library"
          detail={`Review plays the song (${formatBytes(file.size)} on this device).`}
          accessory={
            <Switch
              aria-label="Keep the audio in the library"
              checked={keepAudio}
              onChange={setKeepAudio}
            />
          }
        />
      </Group>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="filled" onClick={() => void save()} loading={saving}>
          Save to library
        </Button>
        <Button variant="gray" onClick={() => void copy()} disabled={!chart.parts.length}>
          Copy chart
        </Button>
        <Button variant="plain" onClick={onReset} className="ml-auto">
          Clear
        </Button>
      </div>
    </div>
  );
}

function KeySpanButton({
  label,
  range,
  active,
  onClick,
}: {
  label: string;
  range: string;
  active: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      data-testid="key-span"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-medium transition-colors',
        active ? 'bg-accent/15 text-accent' : 'bg-fill-3 text-label hover:bg-fill-2',
      )}
    >
      {label}
      <span className={cx('tabular', active ? 'text-accent/70' : 'text-label-3')}>{range}</span>
    </button>
  );
}
