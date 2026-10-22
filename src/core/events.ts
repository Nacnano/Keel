/** Minimal typed emitter used by every `subscribe` / `onX` method. */
export type Listener<T> = (value: T) => void;

export interface Emitter<T> {
  emit(value: T): void;
  subscribe(listener: Listener<T>): () => void;
  clear(): void;
  readonly size: number;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();
  return {
    emit(value) {
      for (const l of Array.from(listeners)) {
        try {
          l(value);
        } catch (err) {
          // One bad listener must not break the others.
          console.error('[emitter] listener threw', err);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      listeners.clear();
    },
    get size() {
      return listeners.size;
    },
  };
}
