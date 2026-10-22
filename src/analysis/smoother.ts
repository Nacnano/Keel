/**
 * Fixed-lag HMM smoother over chord states.
 *
 * Transition model: stay with p = 0.9 + 0.09 * stability, remaining mass uniform over the
 * other N - 1 states. That structure makes every step O(N): the best predecessor of a state
 * is either itself or the global best (second best if the global best is itself).
 *
 * Emission = softmax(similarity / tau). Each frame we
 *   1. advance Viterbi (log domain) and store back-pointers in a 32-frame ring,
 *   2. backtrack `lag` frames from the current best state -> decoded state at t - lag,
 *   3. run the forward filter and a `lag`-step backward pass -> posterior of that state.
 */

export const WINDOW = 32;
export const DEFAULT_TAU = 0.1;

export function stayProbability(stability: number): number {
  return 0.9 + 0.09 * clamp01(stability);
}

/** Decoding lag in frames: 4 (snappy) .. 8 (very stable); 6 at the default 0.5. */
export function lagForStability(stability: number): number {
  return Math.round(4 + 4 * clamp01(stability));
}

export interface SmootherOptions {
  numStates: number;
  stability: number;
  tau?: number;
}

export interface Decoded {
  /** Index of the frame (0-based push count) the decision refers to. */
  frame: number;
  state: number;
  /** Fixed-lag smoothed posterior of `state`, 0..1. */
  confidence: number;
  /**
   * Frames (1..lag+1) the best path stays in `state` from the decided frame on, within the
   * look-ahead window. A short run means the path only passes through the state on its way
   * to another one (a transition blip).
   */
  run: number;
}

export interface Smoother {
  /** Push one frame of similarities (length numStates). Returns a decision once `lag` frames are buffered. */
  push(similarity: ArrayLike<number>): Decoded | null;
  setStability(stability: number): void;
  readonly lag: number;
  readonly frames: number;
  reset(): void;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0.5));
}

export function createSmoother(opts: SmootherOptions): Smoother {
  const n = opts.numStates;
  const tau = opts.tau ?? DEFAULT_TAU;
  let pStay = 0;
  let pSwitch = 0;
  let logStay = 0;
  let logSwitch = 0;
  let lag = 0;

  let delta = new Float64Array(n);
  let nextDelta = new Float64Array(n);
  const backptr = Array.from({ length: WINDOW }, () => new Int16Array(n));
  const emissions = Array.from({ length: WINDOW }, () => new Float64Array(n));
  const alphas = Array.from({ length: WINDOW }, () => new Float64Array(n));
  const path = new Int32Array(WINDOW + 1);
  let beta = new Float64Array(n);
  let nextBeta = new Float64Array(n);
  let t = -1;

  function setStability(stability: number) {
    pStay = stayProbability(stability);
    pSwitch = n > 1 ? (1 - pStay) / (n - 1) : 0;
    logStay = Math.log(pStay);
    logSwitch = n > 1 ? Math.log(pSwitch) : -Infinity;
    lag = Math.min(WINDOW - 1, lagForStability(stability));
  }
  setStability(opts.stability);

  function reset() {
    t = -1;
    delta.fill(0);
  }

  function push(sim: ArrayLike<number>): Decoded | null {
    t++;
    const slot = t % WINDOW;
    const e = emissions[slot];
    let maxSim = -Infinity;
    for (let j = 0; j < n; j++) if (sim[j] > maxSim) maxSim = sim[j];
    // Emission (unnormalised softmax; the partition cancels in argmax and posteriors).
    for (let j = 0; j < n; j++) e[j] = Math.exp((sim[j] - maxSim) / tau);

    const alpha = alphas[slot];
    const bp = backptr[slot];
    if (t === 0) {
      for (let j = 0; j < n; j++) {
        delta[j] = (sim[j] - maxSim) / tau;
        alpha[j] = e[j];
        bp[j] = j;
      }
    } else {
      // Viterbi step.
      let best = 0;
      let second = -1;
      for (let j = 1; j < n; j++) {
        if (delta[j] > delta[best]) {
          second = best;
          best = j;
        } else if (second < 0 || delta[j] > delta[second]) second = j;
      }
      let top = -Infinity;
      for (let j = 0; j < n; j++) {
        const from = j === best ? second : best;
        const stay = delta[j] + logStay;
        const move = from >= 0 ? delta[from] + logSwitch : -Infinity;
        const logE = (sim[j] - maxSim) / tau;
        if (stay >= move) {
          nextDelta[j] = stay + logE;
          bp[j] = j;
        } else {
          nextDelta[j] = move + logE;
          bp[j] = from;
        }
        if (nextDelta[j] > top) top = nextDelta[j];
      }
      for (let j = 0; j < n; j++) nextDelta[j] -= top; // keep numbers bounded
      const tmp = delta;
      delta = nextDelta;
      nextDelta = tmp;

      // Forward filter: alpha_t(j) = e_j * (pStay a(j) + pSwitch (1 - a(j))), prev sums to 1.
      const prev = alphas[(t - 1) % WINDOW];
      for (let j = 0; j < n; j++) alpha[j] = e[j] * (pStay * prev[j] + pSwitch * (1 - prev[j]));
    }
    let z = 0;
    for (let j = 0; j < n; j++) z += alpha[j];
    for (let j = 0; j < n; j++) alpha[j] /= z;

    if (t < lag) return null;

    // Backtrack lag steps from the current best end state (path[i] = state at t - i).
    let s = 0;
    for (let j = 1; j < n; j++) if (delta[j] > delta[s]) s = j;
    path[0] = s;
    for (let k = t, i = 1; k > t - lag; k--, i++) {
      s = backptr[k % WINDOW][s];
      path[i] = s;
    }
    let run = 1;
    while (run <= lag && path[lag - run] === s) run++;

    // Backward pass over the lag window for the smoothed posterior at t - lag.
    beta.fill(1);
    for (let k = t; k > t - lag; k--) {
      const ek = emissions[k % WINDOW];
      let sum = 0;
      for (let j = 0; j < n; j++) sum += ek[j] * beta[j];
      let norm = 0;
      for (let j = 0; j < n; j++) {
        const eb = ek[j] * beta[j];
        nextBeta[j] = pStay * eb + pSwitch * (sum - eb);
        norm += nextBeta[j];
      }
      for (let j = 0; j < n; j++) nextBeta[j] /= norm;
      const tmp = beta;
      beta = nextBeta;
      nextBeta = tmp;
    }
    const a = alphas[(t - lag) % WINDOW];
    let post = 0;
    for (let j = 0; j < n; j++) post += a[j] * beta[j];
    const confidence = post > 0 ? (a[s] * beta[s]) / post : 0;
    return {
      frame: t - lag,
      state: s,
      confidence: Math.min(1, Math.max(0, confidence)),
      run,
    };
  }

  return {
    push,
    setStability,
    reset,
    get lag() {
      return lag;
    },
    get frames() {
      return t + 1;
    },
  };
}
