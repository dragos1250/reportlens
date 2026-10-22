import type { Passage } from "../api/types"

/** A piece of an answer: plain text, or a citation of one or more passages. */
export type Segment = { kind: "text"; text: string } | { kind: "cite"; passages: Passage[] }

// "[P2]" or "[P1, P3]", as written by the model.
const MARKER_GROUP = /\[\s*(P\d+(?:\s*,\s*P\d+)*)\s*\]/g

/**
 * Splits an answer with [P#] markers into text and citations. A marker that matches no
 * passage is kept as plain text: the backend already flags it, and hiding it would hide
 * the problem.
 */
export function splitAnswer(content: string, passages: Passage[]): Segment[] {
  const byMarker = new Map(passages.map((p) => [p.marker, p]))
  const segments: Segment[] = []
  let last = 0
  for (const match of content.matchAll(MARKER_GROUP)) {
    const cited = match[1].split(/\s*,\s*/).map((m) => byMarker.get(m))
    if (cited.some((p) => p === undefined)) continue
    if (match.index > last) segments.push({ kind: "text", text: content.slice(last, match.index) })
    segments.push({ kind: "cite", passages: cited as Passage[] })
    last = match.index + match[0].length
  }
  if (last < content.length) segments.push({ kind: "text", text: content.slice(last) })
  return segments
}

/** Pages of the passages that were checked, in order, without repeats. */
export function checkedPages(passages: Passage[]): number[] {
  return [...new Set(passages.map((p) => p.page))].sort((a, b) => a - b)
}
