/**
 * The reader's text selection in the pdf.js text layer, for Select & explain.
 *
 * react-pdf renders each page as div.react-pdf__Page[data-page-number] with the text in a
 * div.textLayer inside it. A selection is accepted only when it starts and ends in the text
 * layer of the same page; the viewer shows one page at a time today, but a selection that
 * leaves the page (or a future multi-page view) gets a clear message instead of a wrong page.
 */

export interface ReaderSelection {
  page: number
  text: string
}

/** Where the selection is on screen, to place the toolbar above it. */
export interface Box {
  top: number
  left: number
  width: number
  height: number
}

export type SelectionRead =
  | { kind: "none" }
  | { kind: "several-pages" }
  | { kind: "ok"; selection: ReaderSelection; box: Box }

/** Page number of the text layer that contains node, or null outside any text layer. */
export function pageOf(node: Node | null): number | null {
  const element = node instanceof Element ? node : (node?.parentElement ?? null)
  const layer = element?.closest(".textLayer")
  const page = Number(layer?.closest("[data-page-number]")?.getAttribute("data-page-number"))
  return Number.isInteger(page) && page >= 1 ? page : null
}

/** As the reader sees it: soft hyphens gone, words split at a line end joined, whitespace collapsed. */
export function normaliseSelectedText(text: string): string {
  return text
    .replace(/­/g, "")
    .replace(/(\p{L})-\s*\n\s*(?=\p{Ll})/gu, "$1")
    .replace(/\s+/g, " ")
    .trim()
}

export function readSelection(selection: Selection | null, container: Element): SelectionRead {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return { kind: "none" }
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return { kind: "none" }

  const start = pageOf(selection.anchorNode)
  const end = pageOf(selection.focusNode)
  if (start === null && end === null) return { kind: "none" }
  if (start !== end) return { kind: "several-pages" }

  const text = normaliseSelectedText(selection.toString())
  if (text === "") return { kind: "none" }
  // jsdom (tests) has no Range.getBoundingClientRect; the page and text do not depend on it.
  const rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null
  const box = rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : { top: 0, left: 0, width: 0, height: 0 }
  return { kind: "ok", selection: { page: start!, text }, box }
}
