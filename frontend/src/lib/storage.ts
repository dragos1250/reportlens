/**
 * Per-browser preferences in localStorage. Storage can be unavailable (private mode,
 * blocked site data) and then throws: the app keeps working with the default.
 */
export function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : value === "1"
  } catch {
    return fallback
  }
}

export function writeFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0")
  } catch {
    // Not persisted; the choice still applies until the page is reloaded.
  }
}
