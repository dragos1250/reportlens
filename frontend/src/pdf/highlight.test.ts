import { describe, expect, it } from "vitest"

import { findPassage, normaliseText, renderItem, type TextItemLike } from "./highlight"

const line = (str: string, hasEOL = true): TextItemLike => ({ str, hasEOL })

/** Text of the marked ranges, to compare with what a reader would see highlighted. */
function marked(items: TextItemLike[], passage: string): string {
  const { marks } = findPassage(items, passage)
  return items
    .flatMap((item, i) => (marks.get(i) ?? []).map(([s, e]) => item.str.slice(s, e)))
    .join("|")
}

describe("normaliseText", () => {
  it("keeps letters and digits in lower case and collapses the rest", () => {
    expect(normaliseText("Total revenue: €40.5 billion (FY25: €37.4 billion)")).toBe(
      "total revenue 40 5 billion fy25 37 4 billion",
    )
  })

  it("drops unmapped glyph markers and soft hyphens", () => {
    expect(normaliseText("continued (cid:2) Other Euro­pe")).toBe("continued other europe")
  })

  it("keeps Romanian letters", () => {
    expect(normaliseText("Priorități Strategice")).toBe("priorități strategice")
  })
})

describe("findPassage", () => {
  const page = [
    line("Strategic report"),
    line("Results in-line with expectations –Total revenue:", false),
    line(" Increased 8.0% to €40.5 billion (FY25: €37.4"),
    line("billion), due to service revenue growth and the opera-"),
    line("tional consolidation of Three UK."),
    line("Next section starts here."),
  ]

  it("marks an exact match across items, joining a word hyphenated at a line end", () => {
    const passage = "Total revenue: Increased 8.0% to €40.5 billion (FY25: €37.4 billion), due to service revenue growth and the operational consolidation"
    const result = findPassage(page, passage)
    expect(result.method).toBe("exact")
    expect(marked(page, passage)).toBe(
      "Total revenue|Increased 8.0% to €40.5 billion (FY25: €37.4|billion), due to service revenue growth and the opera|tional consolidation",
    )
    expect(result.marks.has(0)).toBe(false)
    expect(result.marks.has(5)).toBe(false)
  })

  it("ignores (cid:N) glyphs left in the passage by ingestion", () => {
    expect(findPassage(page, "Strategic report (cid:2) Results in-line").method).toBe("exact")
  })

  it("falls back to first and last words when the middle was reordered (a table)", () => {
    const table = [
      line("Equity shareholders’ funds 10,414 11,887 319 660"),
      line("2026 €m 2025 €m"),
      line("Interest in joint ventures 5,207 5,943 160 330"),
      line("Carrying value 5,207 5,943 – 330 and some more words after"),
    ]
    const passage = "Equity shareholders’ funds 10,414 11,887 319 660 Interest in joint ventures 5,207 5,943 160 330 Carrying value 5,207 5,943 – 330 and some more words after"
    const result = findPassage(table, passage)
    expect(result.method).toBe("anchors")
    expect(result.marks.size).toBe(4) // from the first anchor to the last, including the stray header row
  })

  it("marks nothing when the passage is not on the page", () => {
    const result = findPassage(page, "We are partnering with AST SpaceMobile to enable D2D satellite connectivity")
    expect(result).toEqual({ method: "none", marks: new Map() })
  })

  it("marks nothing for an empty page or passage", () => {
    expect(findPassage([], "anything").method).toBe("none")
    expect(findPassage(page, "  –  ").method).toBe("none")
  })
})

describe("renderItem", () => {
  it("wraps marked ranges and escapes the PDF text", () => {
    expect(renderItem("a <b> & c", [[2, 5]])).toBe('a <mark class="rl-mark">&lt;b&gt;</mark> &amp; c')
  })

  it("never lets PDF text inject HTML", () => {
    expect(renderItem('<img src=x onerror="alert(1)">', undefined)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    )
  })
})
