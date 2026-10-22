/**
 * Tiny local event bus so app code can nudge the sync engine without
 * importing it (keeps Supabase out of code paths that never sync).
 */
type Listener = () => void;

const sessionSaved = new Set<Listener>();

/** Call after a jam session stops and its rows are written. */
export function notifySessionSaved(): void {
  for (const l of sessionSaved) l();
}

export function onSessionSaved(l: Listener): () => void {
  sessionSaved.add(l);
  return () => sessionSaved.delete(l);
}
