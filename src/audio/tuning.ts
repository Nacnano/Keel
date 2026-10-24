/** Conservative phrase-start calibration; freeze the result to avoid tuning-induced flicker. */
export function createTuningTracker() {
  let history: Array<{ t: number; cents: number }> = [];
  let correction = 0;
  let lastT = -Infinity;
  let started = NaN;
  let lastMainsT = -Infinity;
  function reset() {
    history = [];
    correction = 0;
    lastT = lastMainsT = -Infinity;
    started = NaN;
  }
  return {
    reset,
    update(t: number, cents: number, confidence: number, hasMains = false): number {
      if (t < lastT || t - lastT > 0.5) reset();
      lastT = t;
      if (Number.isNaN(started)) started = t;
      if (hasMains) lastMainsT = t;
      // If the phrase did not offer clear calibration evidence, keep configured A4.
      // Re-estimating under changing voicings can move the displayed notes mid-chord.
      if (correction !== 0 || t - started > 2) return correction;
      if (t - lastMainsT > 2 && confidence > 0.5 && Number.isFinite(cents))
        history.push({ t, cents });
      if (history.length >= 12 && t - history[0].t >= 0.5) {
        const values = history.map((v) => v.cents).sort((a, b) => a - b);
        const middle = values[Math.floor(values.length / 2)];
        const spread =
          values[Math.floor(values.length * 0.75)] - values[Math.floor(values.length * 0.25)];
        // A wide deadband avoids correcting small spectral/inharmonicity biases.
        if (spread < 8 && Math.abs(middle) >= 30 && Math.abs(middle) <= 45)
          correction = Math.round(middle / 5) * 5;
      }
      return correction;
    },
  };
}
