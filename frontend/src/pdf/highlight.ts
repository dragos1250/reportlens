/**
 * Find a cited passage in a page's pdf.js text layer.
 *
 * The passage comes from ingestion (pdfplumber), where the text was cleaned: whitespace
 * collapsed, words hyphenated across lines joined, "(cid:N)" glyphs removed. The text
 * layer is the raw page. Both sides are therefore normalised the same way before
 * comparing: only letters and digits, lower case, any other run of characters becomes
 * one space, and a hyphen at the end of a line joins the two halves of the word.
 */

/** The parts of a pdf.js TextItem this module needs. */
export interface TextItemLike {
  str: string
  hasEOL?: boolean
}

/** Character ranges [start, end) to mark, per text item index. */
export type Marks = Map<number, [number, number][]>

export type MatchMethod = "exact" | "anchors" | "none"

export interface Match {
  method: MatchMethod
  marks: Marks
}

const ANCHOR_WORDS = 8
const WORD_CHAR = /[\p{L}\p{N}]/u

interface Normalised {
  text: string
  /** For each character of text: [item index, offset in item.str], or null for a separator. */
  origin: ([number, number] | null)[]
}

function normaliseItems(items: TextItemLike[]): Normalised {
  let text = ""
  const origin: ([number, number] | null)[] = []
  const space = () => {
    if (text.length > 0 && !text.endsWith(" ")) {
      text += " "
      origin.push(null)
    }
  }
  items.forEach((item, index) => {
    const str = item.str
    // "opera-" at the end of a line + "tional" on the next = "operational"
    const joinsNext = item.hasEOL === true && /[\p{L}]-$/u.test(str)
    const end = joinsNext ? str.length - 1 : str.length
    for (let i = 0; i < end; i++) {
      const ch = str[i]
      if (WORD_CHAR.test(ch)) {
        text += ch.toLowerCase()
        origin.push([index, i])
      } else {
        space()
      }
    }
    if (!joinsNext) space()
  })
  return { text: text.trimEnd(), origin }
}

export function normaliseText(text: string): string {
  return text
    .replace(/\(cid:\d+\)/g, " ")
    .replace(/­/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Marks for the normalised characters [from, to). */
function marksFor(page: Normalised, from: number, to: number): Marks {
  const marks: Marks = new Map()
  for (let i = from; i < to; i++) {
    const origin = page.origin[i]
    if (!origin) continue
    const [item, offset] = origin
    const ranges = marks.get(item) ?? []
    const last = ranges[ranges.length - 1]
    if (last && last[1] >= offset) last[1] = Math.max(last[1], offset + 1)
    else ranges.push([offset, offset + 1])
    marks.set(item, ranges)
  }
  // Extend each range over the separators between marked characters of the same item.
  for (const ranges of marks.values()) {
    for (let i = ranges.length - 1; i > 0; i--) {
      ranges[i - 1][1] = ranges[i][1]
      ranges.splice(i, 1)
    }
  }
  return marks
}

export function findPassage(items: TextItemLike[], passage: string): Match {
  const page = normaliseItems(items)
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * HTML for one text-layer item with its marked ranges wrapped in <mark>. react-pdf inserts
 * this string as HTML, so the PDF's own text is always escaped first.
 */
export function renderItem(str: string, ranges: [number, number][] | undefined): string {
  if (!ranges || ranges.length === 0) return escapeHtml(str)
  let html = ""
  let last = 0
  for (const [start, end] of ranges) {
    html += escapeHtml(str.slice(last, start))
    html += `<mark class="rl-mark">${escapeHtml(str.slice(start, end))}</mark>`
    last = end
  }
  return html + escapeHtml(str.slice(last))
}
