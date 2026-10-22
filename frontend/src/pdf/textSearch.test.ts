import { describe, expect, it, vi } from "vitest"

import { marksForHit, normaliseQuery, searchPage, textSourceFor } from "./textSearch"

// Shaped like real pdf.js output: pdf.js emits its own space items for gaps and marks
// line ends with hasEOL.
const PAGE = [
  { str: "We are partnering with ", hasEOL: false },
  { str: "AST SpaceMobile", hasEOL: false },
  { str: " ", hasEOL: false },
  { str: "to enable D2D satellite connectivity. The opera-", hasEOL: true },
  { str: "tional facilities of €7.6 billion are undrawn.", hasEOL: true },
  { str: "Equity shareholders’ funds; ast spacemobile again.", hasEOL: true },
]

describe("searchPage", () => {
  it("finds every match regardless of case, with context in the original case", () => {
    const hits = searchPage(38, PAGE, "ast spacemobile")
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({ page: 38, match: "AST SpaceMobile" })
    expect(hits[0].before).toBe("We are partnering with ")
    expect(hits[0].after.startsWith(" to enable D2D")).toBe(true)
    expect(hits[1].match).toBe("ast spacemobile")
  })

  it("is literal: punctuation counts", () => {
    expect(searchPage(1, PAGE, "€7.6 billion")).toHaveLength(1)
    expect(searchPage(1, PAGE, "7 6 billion")).toHaveLength(0)
  })

  it("finds a word hyphenated across a line break", () => {
    expect(searchPage(1, PAGE, "operational facilities")[0].match).toBe("operational facilities")
  })

  it("treats typographic and typed apostrophes the same", () => {
    expect(searchPage(1, PAGE, "shareholders' funds")).toHaveLength(1)
  })

  it("collapses whitespace in the query", () => {
    expect(searchPage(1, PAGE, "  satellite \n  connectivity ")).toHaveLength(1)
  })

  it("does not fold diacritics", () => {
    const ro = [{ str: "Prioritățile strategice", hasEOL: true }]
    expect(searchPage(1, ro, "priorități")).toHaveLength(1)
    expect(searchPage(1, ro, "prioritati")).toHaveLength(0)
  })

  it("returns nothing for no match, a too short query or an empty page", () => {
    expect(searchPage(1, PAGE, "bitcoin")).toEqual([])
    expect(searchPage(1, PAGE, "a")).toEqual([])
    expect(searchPage(1, [], "satellite")).toEqual([])
  })

  it("keeps HTML in the page text and in the query as plain text", () => {
    const page = [{ str: 'Before <img src=x onerror="alert(1)"> after', hasEOL: true }]
    const [hit] = searchPage(1, page, "<img src=x")
    expect(hit.match).toBe("<img src=x")
    expect(hit.after).toBe(' onerror="alert(1)"> after')
  })
})

describe("marksForHit", () => {
  it("marks exactly the matched characters of each text item", () => {
    const [hit] = searchPage(38, PAGE, "spacemobile to enable")
    const marks = marksForHit(PAGE, hit)
    expect(marks.get(1)).toEqual([[4, 15]])
    expect(marks.get(3)).toEqual([[0, 9]])
  })
})

describe("normaliseQuery", () => {
  it("lower-cases, unifies apostrophes and trims", () => {
    expect(normaliseQuery("  Shareholders’ FUNDS ")).toBe("shareholders' funds")
  })
})

describe("textSourceFor", () => {
  it("extracts each page once and reuses it", async () => {
    const getTextContent = vi.fn(async () => ({ items: [{ str: "text", hasEOL: true }, { type: "beginMarkedContent" }] }))
    const pdf = { numPages: 2, getPage: vi.fn(async () => ({ getTextContent })) }
    const source = textSourceFor(pdf)
    expect(await source.pageText(1)).toEqual([{ str: "text", hasEOL: true }, { str: "" }])
    await source.pageText(1)
    expect(pdf.getPage).toHaveBeenCalledTimes(1)
  })
})
