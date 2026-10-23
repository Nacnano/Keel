/**
 * One-time rename of localStorage keys written before the app was called Keel.
 * Every key that starts with the old prefix is copied to the same key under the
 * `keel` prefix (unless that key already exists) and the old key is removed.
 * Covers settings, UI preferences and the Supabase auth session.
 *
 * Runs as a side effect of `src/bootstrap.ts`, which `main.tsx` imports before
 * anything that reads localStorage at module scope (the zustand settings store).
 */
export const LEGACY_STORAGE_PREFIX = 'jamkey';
export const STORAGE_PREFIX = 'keel';

/** Returns the number of keys migrated. Never throws (private mode, quota). */
export function migrateLegacyLocalStorage(storage: Storage | undefined = globalStorage()): number {
  if (!storage) return 0;
  let moved = 0;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && isLegacyKey(key)) legacyKeys.push(key);
    }
    for (const key of legacyKeys) {
      const next = STORAGE_PREFIX + key.slice(LEGACY_STORAGE_PREFIX.length);
      const value = storage.getItem(key);
      if (value !== null && storage.getItem(next) === null) {
        storage.setItem(next, value);
        moved++;
      }
      storage.removeItem(key);
    }
  } catch {
    /* storage unavailable: nothing to migrate */
  }
  return moved;
}

function isLegacyKey(key: string): boolean {
  if (!key.startsWith(LEGACY_STORAGE_PREFIX)) return false;
  const sep = key.charAt(LEGACY_STORAGE_PREFIX.length);
  return sep === '.' || sep === '-' || sep === '';
}

function globalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
