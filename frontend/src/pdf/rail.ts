/** Page rail geometry: every page maps to a position from 0 (top) to 1 (bottom). */

export function railPosition(page: number, pages: number): number {
  if (pages <= 1) return 0
  return (Math.min(Math.max(page, 1), pages) - 1) / (pages - 1)
}

/** Inverse of railPosition, for a click at a fraction of the rail's height. */
export function pageAt(fraction: number, pages: number): number {
  const clamped = Math.min(Math.max(fraction, 0), 1)
  return Math.round(clamped * (pages - 1)) + 1
}

/** Pages that get a hairline tick: about `target` of them, evenly spaced, first and last included. */
export function tickPages(pages: number, target = 80): number[] {
  if (pages <= 0) return []
  const step = Math.max(1, Math.round(pages / target))
  const ticks: number[] = []
  for (let page = 1; page <= pages; page += step) ticks.push(page)
  if (ticks[ticks.length - 1] !== pages) ticks.push(pages)
  return ticks
}
