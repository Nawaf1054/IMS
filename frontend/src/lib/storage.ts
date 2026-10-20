/**
 * localStorage wrappers that never throw (private mode, blocked storage).
 * Only for per-browser conveniences and the session tokens.
 */

/** The stored value, or null if missing or storage is unavailable. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Stores a value, or removes it when `value` is null. Silently does nothing if storage is blocked. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the value simply isn't remembered.
  }
}
