/**
 * Timing budgets for performance tests. CI runners are slower than a laptop and
 * V8 coverage instrumentation adds overhead, so budgets scale up there. The
 * tests still catch order-of-magnitude regressions; absolute numbers are logged
 * in the test output for reference.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined;

const isCI = typeof process !== 'undefined' && Boolean(process?.env?.CI);
const SCALE = isCI ? 4 : 1;

/** Returns `ms` scaled for the current environment. */
export function perfBudget(ms: number): number {
  return ms * SCALE;
}
