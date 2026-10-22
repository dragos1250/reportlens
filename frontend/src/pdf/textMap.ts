/**
 * Turns a page's pdf.js text items into one comparable string, remembering where every
 * character came from, so that a match in that string can be marked back in the text
 * layer. Shared by the citation highlight and the text search.
 */

/** The parts of a pdf.js TextItem this module needs. */
export interface TextItemLike {
  str: string
  hasEOL?: boolean
}

/** Character ranges [start, end) to mark, per text item index. */
export type Marks = Map<number, [number, number][]>

/**
 * - "words" (citation highlight): letters and digits only, any other run becomes one
 *   space, item boundaries are separators. Matches text cleaned by ingestion.
 * - "literal" (text search): every character kept and lower-cased, whitespace runs become
 *   one space, typographic apostrophes become ', items on one line are joined as they are
 *   (pdf.js emits its own space items for gaps), a space only at line ends.
 * In both modes a hyphen at the end of a line joins the two halves of the word.
 */
export type MapMode = "words" | "literal"

export interface MappedText {
  text: string
  /** For each character of text: [item index, offset in item.str], or null for an added space. */
  origin: ([number, number] | null)[]
}

const WORD_CHAR = /[\p{L}\p{N}]/u
const WHITESPACE = /\s/u
const APOSTROPHES = /[‘’ʼ]/u

export function mapItems(items: TextItemLike[], mode: MapMode): MappedText {
  let text = ""
  const origin: ([number, number] | null)[] = []
  const space = () => {
    if (text.length > 0 && !text.endsWith(" ")) {
      text += " "
      origin.push(null)
    }
  }
  const add = (ch: string, item: number, offset: number) => {
    text += ch
    origin.push([item, offset])
  }

  items.forEach((item, index) => {
    const str = item.str
    // "opera-" at the end of a line + "tional" on the next = "operational"
    const joinsNext = item.hasEOL === true && /[\p{L}]-$/u.test(str)
    const end = joinsNext ? str.length - 1 : str.length
    for (let i = 0; i < end; i++) {
      const ch = str[i]
      if (mode === "words") {
        if (WORD_CHAR.test(ch)) add(ch.toLowerCase(), index, i)
        else space()
      } else if (WHITESPACE.test(ch)) {
        space()
      } else {
        const lower = APOSTROPHES.test(ch) ? "'" : ch.toLowerCase()
        add(lower.length === 1 ? lower : ch, index, i) // keep offsets 1:1 with the item text
      }
    }
    if (!joinsNext && (mode === "words" || item.hasEOL)) space()
  })
  if (text.endsWith(" ")) {
    // Drop the trailing separator from both, so text and origin stay the same length.
    text = text.slice(0, -1)
    origin.pop()
  }
  return { text, origin }
}

/** Marks for the mapped characters [from, to). */
export function marksFor(mapped: MappedText, from: number, to: number): Marks {
  const marks: Marks = new Map()
  for (let i = from; i < to; i++) {
    const origin = mapped.origin[i]
    if (!origin) continue
    const [item, offset] = origin
    const ranges = marks.get(item) ?? []
    const last = ranges[ranges.length - 1]
    if (last && last[1] >= offset) last[1] = Math.max(last[1], offset + 1)
    else ranges.push([offset, offset + 1])
    marks.set(item, ranges)
  }
  // One range per item: also cover the separators between its marked characters.
  for (const ranges of marks.values()) {
    for (let i = ranges.length - 1; i > 0; i--) {
      ranges[i - 1][1] = ranges[i][1]
      ranges.splice(i, 1)
    }
  }
  return marks
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
