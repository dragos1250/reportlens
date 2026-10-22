import { describe, expect, it } from "vitest"

import { mapItems, marksFor } from "./textMap"

const items = [
  { str: "Total revenue grew to ", hasEOL: false },
  { str: "€7.6", hasEOL: false },
  { str: " ", hasEOL: false },
  { str: "billion. The opera-", hasEOL: true },
  { str: "tional  shareholders’ funds", hasEOL: true },
]

describe("mapItems", () => {
  it("words mode keeps letters and digits, everything else is one space", () => {
    expect(mapItems(items, "words").text).toBe("total revenue grew to 7 6 billion the operational shareholders funds")
  })

  it("literal mode keeps punctuation, joins items on a line as they are and lower-cases", () => {
    expect(mapItems(items, "literal").text).toBe("total revenue grew to €7.6 billion. the operational shareholders' funds")
  })

  it("remembers the item and offset of every kept character", () => {
    const mapped = mapItems(items, "literal")
    const at = mapped.text.indexOf("€7.6")
    expect(mapped.origin[at]).toEqual([1, 0])
    expect(mapped.text.length).toBe(mapped.origin.length)
  })
})

describe("marksFor", () => {
  it("turns a span of the mapped text into ranges per item", () => {
    const mapped = mapItems(items, "literal")
    const from = mapped.text.indexOf("€7.6 billion")
    const marks = marksFor(mapped, from, from + "€7.6 billion".length)
    expect(marks.get(1)).toEqual([[0, 4]])
    expect(marks.get(3)).toEqual([[0, 7]])
  })
})
