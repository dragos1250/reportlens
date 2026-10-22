/**
 * Exact text search in the report, without AI and without the backend: the text layer
 * pdf.js extracts from each page is searched in the browser.
 *
 * "Exact" means a literal, case-insensitive match. Three things are normalised on both
 * sides, because readers cannot see them: runs of whitespace, a word hyphenated across a
 * line break, and typographic apostrophes. Diacritics are not folded: "prioritati" does
 * not find "priorități".
 */

import { mapItems, type MappedText, marksFor, type Marks, type TextItemLike } from "./textMap"

export const MIN_QUERY_LENGTH = 2
const CONTEXT_CHARS = 60

export interface SearchHit {
  page: number
  /** Position of the match in the page's mapped text; stable for the same page text. */
  start: number
  end: number
  /** Context around the match in the page's original characters (not lower-cased). */
  before: string
  match: string
  after: string
}

export function normaliseQuery(query: string): string {
  return query.replace(/[‘’ʼ]/g, "'").toLowerCase().replace(/\s+/g, " ").trim()
}

/** The original characters behind mapped[from, to), with added separators as spaces. */
function originalText(items: TextItemLike[], mapped: MappedText, from: number, to: number): string {
  let text = ""
  for (let i = Math.max(0, from); i < Math.min(to, mapped.origin.length); i++) {
    const origin = mapped.origin[i]
    text += origin ? items[origin[0]].str[origin[1]] : " "
  }
  return text
}

export function searchPage(page: number, items: TextItemLike[], query: string): SearchHit[] {
  const needle = normaliseQuery(query)
  if (needle.length < MIN_QUERY_LENGTH) return []
  const mapped = mapItems(items, "literal")
  const hits: SearchHit[] = []
  let from = 0
  for (let at = mapped.text.indexOf(needle); at !== -1; at = mapped.text.indexOf(needle, from)) {
    const end = at + needle.length
    hits.push({
      page,
      start: at,
      end,
      before: originalText(items, mapped, at - CONTEXT_CHARS, at),
      match: originalText(items, mapped, at, end),
      after: originalText(items, mapped, end, end + CONTEXT_CHARS),
    })
    from = end
  }
  return hits
}

/** What to mark in the text layer for one hit, with the same mapping the search used. */
export function marksForHit(items: TextItemLike[], hit: Pick<SearchHit, "start" | "end">): Marks {
  return marksFor(mapItems(items, "literal"), hit.start, hit.end)
}

/** Where page text comes from: pdf.js in the app, a fake in tests. */
export interface TextSource {
  numPages: number
  pageText(page: number): Promise<TextItemLike[]>
}

/** The minimal part of pdf.js's PDFDocumentProxy used here. */
export interface PdfDocumentLike {
  numPages: number
  getPage(page: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>
}

/**
 * Text of each page, extracted once and kept for the open document: the first search
 * reads the whole file (32 MB for the test report), later searches reuse the text.
 */
export function textSourceFor(pdf: PdfDocumentLike): TextSource {
  const cache = new Map<number, Promise<TextItemLike[]>>()
  return {
    numPages: pdf.numPages,
    pageText(page) {
      let text = cache.get(page)
      if (!text) {
        text = pdf
          .getPage(page)
          .then((p) => p.getTextContent())
          .then((content) =>
            content.items.map((item) => (item && typeof item === "object" && "str" in item ? (item as TextItemLike) : { str: "" })),
          )
        text.catch(() => cache.delete(page)) // a failed page can be retried
        cache.set(page, text)
      }
      return text
    },
  }
}
