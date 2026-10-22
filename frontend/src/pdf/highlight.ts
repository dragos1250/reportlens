/**
 * Find a cited passage in a page's pdf.js text layer.
 *
 * The passage comes from ingestion (pdfplumber), where the text was cleaned: whitespace
 * collapsed, words hyphenated across lines joined, "(cid:N)" glyphs removed. The text
 * layer is the raw page. Both sides are therefore normalised the same way before
 * comparing: only letters and digits, lower case, any other run of characters becomes
 * one space, and a hyphen at the end of a line joins the two halves of the word.
 */

import { mapItems, marksFor, type Marks, type TextItemLike } from "./textMap"

export { renderItem, type Marks, type TextItemLike } from "./textMap"

export type MatchMethod = "exact" | "anchors" | "none"

export interface Match {
  method: MatchMethod
  marks: Marks
}

const ANCHOR_WORDS = 8

export function normaliseText(text: string): string {
  return text
    .replace(/\(cid:\d+\)/g, " ")
    .replace(/­/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export function findPassage(items: TextItemLike[], passage: string): Match {
  const page = mapItems(items, "words")
  const needle = normaliseText(passage)
  if (needle.length === 0 || page.text.length === 0) return { method: "none", marks: new Map() }

  const exact = page.text.indexOf(needle)
  if (exact !== -1) return { method: "exact", marks: marksFor(page, exact, exact + needle.length) }

  // Fallback for reordered text (tables, columns): the first and the last words must both
  // be found, in order, and not absurdly far apart. Otherwise mark nothing.
  const words = needle.split(" ")
  if (words.length >= ANCHOR_WORDS * 2) {
    const head = words.slice(0, ANCHOR_WORDS).join(" ")
    const tail = words.slice(-ANCHOR_WORDS).join(" ")
    const start = page.text.indexOf(head)
    const tailAt = start === -1 ? -1 : page.text.indexOf(tail, start + head.length)
    if (start !== -1 && tailAt !== -1) {
      const end = tailAt + tail.length
      if (end - start <= needle.length * 2) return { method: "anchors", marks: marksFor(page, start, end) }
    }
  }
  return { method: "none", marks: new Map() }
}
