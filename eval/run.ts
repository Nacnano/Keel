/**
 * Detection-accuracy evaluation: render piano jam sessions, degrade them, run them through
 * the live pipeline exactly as the app does (createChromaPipeline hop by hop →
 * createAnalysisEngine), and score what the jam screen would show.
 *
 *   pnpm eval                 full run, writes docs/ACCURACY.md and eval/.cache/last.json
 *   pnpm eval --quick         3 sessions, 6 conditions, no sweep (smoke test, ~15 s)
 *   pnpm eval --save-baseline also writes eval/baseline.json (the "before" numbers)
 *   pnpm eval --no-write      print only
 *   pnpm eval --synth         force the additive synth instead of the real piano samples
 *
 * Not part of CI (needs network on first run to fetch ~10 MB of samples).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { createAnalysisEngine } from '@/analysis';
import { createChromaPipeline, type PipelineConfig } from '@/audio/pipeline';
import { DEFAULT_ANALYSIS_CONFIG } from '@/core/constants';
import type { AnalysisConfig, ChromaFrame, JamMode, VocabLevel } from '@/core/types';
import { CONDITIONS, conditionById } from './conditions';
import { computeStats, mergeStats, type RunStats, type TimedChord, type TimedKey } from './metrics';
import { renderSession, SESSIONS, type Session } from './render';
import { median, quantile } from './util';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const args = new Set(process.argv.slice(2));
const QUICK = args.has('--quick');
const WRITE = !args.has('--no-write');
const SAVE_BASELINE = args.has('--save-baseline');
const FORCE_SYNTH = args.has('--synth');

interface EvalConfig {
  stability: number;
  vocabLevel: VocabLevel;
  mode: JamMode;
}

const PRIMARY: EvalConfig = { stability: 0.5, vocabLevel: 2, mode: 'solo' };
const cfgId = (c: EvalConfig) => `s${c.stability}/L${c.vocabLevel}/${c.mode}`;

/** Extra pipeline options (e.g. sensitivity) applied to every run. */
const PIPELINE_EXTRA: Partial<PipelineConfig> = {};

// ------------------------------------------------------------------ frames + engine

function framesFor(samples: Float32Array, sr: number, mode: JamMode): ChromaFrame[] {
  const pipeline = createChromaPipeline({
    sampleRate: sr,
    instrument: 'piano',
    mode,
    ...PIPELINE_EXTRA,
  });
  const hop = pipeline.config.hopSize;
  const frames: ChromaFrame[] = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    const f = pipeline.process(samples.subarray(i, i + hop), i / sr);
    if (f) frames.push({ ...f, chroma: Float32Array.from(f.chroma) });
  }
  return frames;
}

function runEngine(frames: ChromaFrame[], sr: number, hop: number, cfg: EvalConfig) {
  const config: AnalysisConfig = {
    ...DEFAULT_ANALYSIS_CONFIG,
    instrument: 'piano',
    mode: cfg.mode,
    stability: cfg.stability,
    vocabLevel: cfg.vocabLevel,
  };
  const engine = createAnalysisEngine(config);
  const chords: TimedChord[] = [];
  const keys: TimedKey[] = [];
  let wall = 0;
  engine.subscribe((e) => {
    if (e.type === 'chord') chords.push({ wall, chord: e.chord, confidence: e.confidence });
    else if (e.type === 'key') keys.push({ wall, key: e.key });
  });
  for (const f of frames) {
    wall = f.t + hop / sr; // the frame exists once its newest hop is complete
    engine.push(f);
  }
  return { chords, keys };
}

// ------------------------------------------------------------------ plan

interface Row {
  condition: string;
  config: string;
  sampleRate: number;
  stats: RunStats;
  perSession: Record<string, RunStats>;
}

interface Summary {
  rq: number;
  root: number;
  dash: number;
  latMed: number;
  latP90: number;
  miss: number;
  spurious: number;
  key: number;
  keyRel: number;
  firstKey: number | null;
}

function summarise(s: RunStats): Summary {
  return {
    rq: s.rqSec / s.gtSec,
    root: s.rootSec / s.gtSec,
    dash: s.dashSec / s.gtSec,
    latMed: median(s.latencies) * 1000,
    latP90: quantile(s.latencies, 0.9) * 1000,
    miss: s.changes ? s.missed / s.changes : 0,
    spurious: s.spurious / (s.gtSec / 60),
    key: s.keySec / s.sessionSec,
    keyRel: s.keyRelSec / s.sessionSec,
    firstKey: s.firstKey,
  };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}`;
const ms = (x: number) => (Number.isFinite(x) ? `${Math.round(x)}` : '–');
const sec = (x: number | null) => (x === null || !Number.isFinite(x) ? 'never' : x.toFixed(1));

const HEADER =
  '| Condition | Chord % | Root % | Dash % | Latency med / p90 (ms) | Missed % | Spurious /min | Key % | Key or rel. % | First key (s) |\n' +
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';

function rowLine(label: string, s: Summary): string {
  return `| ${label} | ${pct(s.rq)} | ${pct(s.root)} | ${pct(s.dash)} | ${ms(s.latMed)} / ${ms(s.latP90)} | ${pct(s.miss)} | ${s.spurious.toFixed(1)} | ${pct(s.key)} | ${pct(s.keyRel)} | ${sec(s.firstKey)} |`;
}

async function main() {
  const t0 = Date.now();
  const sessionSpecs = QUICK
    ? SESSIONS.filter((s) =>
        ['pop-C-block-90', 'pop-G-broken-72', 'jazz-Bb-251-120'].includes(s.id),
      )
    : SESSIONS;
  const conditionIds = QUICK
    ? ['clean', 'pink10', 'low40', 'laptop', 'speaker', 'vocal']
    : CONDITIONS.map((c) => c.id);
  const sweepConditions = QUICK ? [] : ['clean', 'pink10', 'laptop', 'speaker'];
  const roomConditions = new Set([...sweepConditions, 'vocal', 'speaker']);
  const rates44 = QUICK ? [] : ['clean', 'low40', 'laptop'];
  const sweep: EvalConfig[] = [];
  if (!QUICK) {
    for (const stability of [0.3, 0.5, 0.7]) {
      for (const vocabLevel of [2, 3] as VocabLevel[]) {
        for (const mode of ['solo', 'room'] as JamMode[])
          sweep.push({ stability, vocabLevel, mode });
      }
    }
  }

  const rows: Row[] = [];
  const sessionsBy: Record<number, Session[]> = {};
  let usedSynth = false;
  for (const sr of [48000, ...(rates44.length ? [44100] : [])]) {
    sessionsBy[sr] = [];
    for (const spec of sessionSpecs) {
      const s = await renderSession(spec, sr, { forceSynth: FORCE_SYNTH });
      usedSynth ||= s.synth;
      sessionsBy[sr].push(s);
    }
  }
  console.log(
    `rendered ${sessionSpecs.length} sessions in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );

  const runs = new Map<string, Map<string, RunStats>>(); // key cond|cfg|sr → session → stats
  const record = (cond: string, cfg: EvalConfig, sr: number, session: Session, st: RunStats) => {
    const k = `${cond}|${cfgId(cfg)}|${sr}`;
    if (!runs.has(k)) runs.set(k, new Map());
    runs.get(k)!.set(session.id, st);
  };

  for (const sr of Object.keys(sessionsBy).map(Number)) {
    const conds = sr === 48000 ? conditionIds : rates44;
    for (const condId of conds) {
      const cond = conditionById(condId);
      for (const session of sessionsBy[sr]) {
        const x = cond.apply(session.samples, {
          sampleRate: sr,
          key: session.key,
          seed: session.spec.seed * 1000,
        });
        const modes: JamMode[] =
          sr === 48000 && roomConditions.has(condId) ? ['solo', 'room'] : ['solo'];
        for (const mode of modes) {
          const frames = framesFor(x, sr, mode);
          const configs = [PRIMARY, { ...PRIMARY, mode: 'room' as JamMode }]
            .concat(sr === 48000 && sweepConditions.includes(condId) ? sweep : [])
            .filter((c) => c.mode === mode)
            .filter((c, i, arr) => arr.findIndex((d) => cfgId(d) === cfgId(c)) === i);
          for (const cfg of configs) {
            const { chords, keys } = runEngine(frames, sr, 2048, cfg);
            const st = computeStats(
              session.chords,
              session.key,
              chords,
              keys,
              cfg.vocabLevel,
              session.durationSec,
            );
            record(condId, cfg, sr, session, st);
          }
        }
      }
      process.stdout.write(`.${condId}@${sr / 1000}k `);
    }
  }
  console.log(`\nanalysed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  for (const [k, m] of runs) {
    const [condition, config, srStr] = k.split('|');
    rows.push({
      condition,
      config,
      sampleRate: Number(srStr),
      stats: mergeStats([...m.values()]),
      perSession: Object.fromEntries(m),
    });
  }
  const find = (condition: string, config: string, sr = 48000) =>
    rows.find((r) => r.condition === condition && r.config === config && r.sampleRate === sr);

  // ---------------------------------------------------------------- report
  const commit = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    } catch {
      return 'unknown';
    }
  })();
  const dirty = (() => {
    try {
      return execSync('git status --porcelain -- src', { cwd: ROOT }).toString().trim()
        ? '+dirty'
        : '';
    } catch {
      return '';
    }
  })();
  const date = new Date().toLocaleDateString('sv-SE'); // local YYYY-MM-DD
  const totalAudio = sessionsBy[48000].reduce((a, s) => a + s.durationSec, 0);
  const lines: string[] = [];
  lines.push('# Detection accuracy');
  lines.push('');
  lines.push(
    `Generated by \`pnpm eval\` (eval/run.ts) on ${date} at commit \`${commit}${dirty}\`. ` +
      `${sessionSpecs.length} sessions, ${totalAudio.toFixed(0)} s of piano at 48 kHz, ` +
      (usedSynth
        ? '**additive synth fallback (piano samples could not be fetched)**.'
        : 'rendered from the Splendid Grand Piano samples the app uses.') +
      ' See eval/README.md for the sessions, conditions and metric definitions.',
  );
  lines.push('');

  const baselinePath = join(HERE, 'baseline.json');
  if (existsSync(baselinePath) && !SAVE_BASELINE) {
    const base = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      commit: string;
      date: string;
      rows: Array<{ condition: string; config: string; sampleRate: number; summary: Summary }>;
    };
    lines.push(
      `## Before / after (stability 0.5, level 2; baseline \`${base.commit}\`, ${base.date})`,
    );
    lines.push('');
    lines.push(
      '| Condition | Chord % | Root % | Dash % | Latency med (ms) | Spurious /min | Key % | First key (s) |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    const keyConds: Array<[string, string, string]> = [
      ['clean', 's0.5/L2/solo', 'Clean'],
      ['pink10', 's0.5/L2/solo', 'Pink noise 10 dB'],
      ['low40', 's0.5/L2/solo', 'Low level −40 dBFS'],
      ['laptop', 's0.5/L2/solo', 'Laptop mic'],
      ['speaker', 's0.5/L2/solo', 'Speaker in room'],
      ['vocal', 's0.5/L2/room', 'Vocal distractor (Room)'],
    ];
    for (const [c, cfg, label] of keyConds) {
      const b = base.rows.find(
        (r) => r.condition === c && r.config === cfg && r.sampleRate === 48000,
      );
      const a = find(c, cfg);
      if (!b || !a) continue;
      const s = summarise(a.stats);
      const arrow = (x: string, y: string) => `${x} → **${y}**`;
      lines.push(
        `| ${label} | ${arrow(pct(b.summary.rq), pct(s.rq))} | ${arrow(pct(b.summary.root), pct(s.root))} | ${arrow(pct(b.summary.dash), pct(s.dash))} | ${arrow(ms(b.summary.latMed), ms(s.latMed))} | ${arrow(b.summary.spurious.toFixed(1), s.spurious.toFixed(1))} | ${arrow(pct(b.summary.key), pct(s.key))} | ${arrow(sec(b.summary.firstKey), sec(s.firstKey))} |`,
      );
    }
    lines.push('');
  }

  lines.push('## All conditions (stability 0.5, level 2, Solo unless noted, 48 kHz)');
  lines.push('');
  lines.push(HEADER);
  for (const condId of conditionIds) {
    const r = find(condId, cfgId(PRIMARY));
    if (r) lines.push(rowLine(conditionById(condId).label, summarise(r.stats)));
    const room = find(condId, cfgId({ ...PRIMARY, mode: 'room' }));
    if (room && (condId === 'vocal' || condId === 'speaker')) {
      lines.push(rowLine(`${conditionById(condId).label} — **Room mode**`, summarise(room.stats)));
    }
  }
  lines.push('');

  if (sweep.length) {
    lines.push('## Config sweep (48 kHz)');
    lines.push('');
    lines.push(
      '| Config | Clean chord % | Pink 10 dB chord % | Laptop chord % | Speaker chord % | Latency med (ms, mean of 4) | Spurious /min (mean of 4) | Dash % (mean of 4) |',
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const cfg of sweep) {
      const rs = sweepConditions.map((c) => find(c, cfgId(cfg)));
      if (rs.some((r) => !r)) continue;
      const ss = rs.map((r) => summarise(r!.stats));
      const mean = (f: (s: Summary) => number) => ss.reduce((a, s) => a + f(s), 0) / ss.length;
      lines.push(
        `| stability ${cfg.stability}, level ${cfg.vocabLevel}, ${cfg.mode} | ${ss.map((s) => pct(s.rq)).join(' | ')} | ${ms(mean((s) => s.latMed))} | ${mean((s) => s.spurious).toFixed(1)} | ${pct(mean((s) => s.dash))} |`,
      );
    }
    lines.push('');
  }

  if (rates44.length) {
    lines.push('## 44.1 kHz (stability 0.5, level 2, Solo)');
    lines.push('');
    lines.push(HEADER);
    for (const c of rates44) {
      const r = find(c, cfgId(PRIMARY), 44100);
      if (r) lines.push(rowLine(conditionById(c).label, summarise(r.stats)));
    }
    lines.push('');
  }

  for (const c of ['clean', 'laptop']) {
    const r = find(c, cfgId(PRIMARY));
    if (!r) continue;
    lines.push(`## Per session: ${conditionById(c).label} (stability 0.5, level 2, Solo)`);
    lines.push('');
    lines.push(HEADER.replace('| Condition |', '| Session |'));
    for (const [id, st] of Object.entries(r.perSession)) {
      lines.push(rowLine(`\`${id}\``, summarise(mergeStats([st]))));
    }
    lines.push('');
  }

  lines.push(
    `Runtime ${((Date.now() - t0) / 1000).toFixed(0)} s. Chord % = time the displayed chord has the right root and quality ` +
      '(written chord reduced to the vocabulary level: Gm9 → Gm7 at level 2; slash bass ignored); a dash counts as wrong. ' +
      'Latency = downbeat → first correct label on screen (includes the smoother lag). Missed = the correct label never ' +
      'appeared during the chord. Spurious = display changes into a wrong label, per minute of playing.',
  );
  const md = lines.join('\n') + '\n';
  console.log('\n' + md);

  const json = {
    commit: commit + dirty,
    date,
    synth: usedSynth,
    rows: rows.map((r) => ({
      condition: r.condition,
      config: r.config,
      sampleRate: r.sampleRate,
      summary: summarise(r.stats),
      perSession: Object.fromEntries(
        Object.entries(r.perSession).map(([k, v]) => [k, summarise(mergeStats([v]))]),
      ),
    })),
  };
  mkdirSync(join(HERE, '.cache'), { recursive: true });
  writeFileSync(join(HERE, '.cache', 'last.json'), JSON.stringify(json, null, 1));
  // Committed outputs go through prettier so `pnpm lint` stays green.
  const pretty = async (text: string, file: string) =>
    format(text, { ...(await resolveConfig(file)), filepath: file });
  if (SAVE_BASELINE) {
    const slim = {
      ...json,
      rows: json.rows.map((r) => ({
        condition: r.condition,
        config: r.config,
        sampleRate: r.sampleRate,
        summary: r.summary,
      })),
    };
    writeFileSync(baselinePath, await pretty(JSON.stringify(slim), baselinePath));
  }
  if (WRITE && !QUICK) {
    const out = join(ROOT, 'docs', 'ACCURACY.md');
    writeFileSync(out, await pretty(md, out));
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
