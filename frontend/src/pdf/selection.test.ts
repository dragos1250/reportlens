import { afterEach, describe, expect, it } from "vitest"

import { normaliseSelectedText, pageOf, readSelection } from "./selection"

/** Two pages as react-pdf renders them, plus something outside the text layers. */
function renderPages() {
  document.body.innerHTML = `
    <div id="viewer">
      <div class="react-pdf__Page" data-page-number="25">
        <canvas></canvas>
        <div class="textLayer"><span id="a">Cash €9.0 billion and undrawn </span><span id="b">committed facilities of €7.6 billion.</span></div>
      </div>
      <div class="react-pdf__Page" data-page-number="26">
        <div class="textLayer"><span id="c">Liquidity is reviewed daily.</span></div>
      </div>
      <p id="outside">Opening the report…</p>
    </div>
    <p id="elsewhere">Assistant panel text</p>`
  return document.getElementById("viewer")!
}

function select(startId: string, startOffset: number, endId: string, endOffset: number) {
  const range = document.createRange()
  range.setStart(document.getElementById(startId)!.firstChild!, startOffset)
  range.setEnd(document.getElementById(endId)!.firstChild!, endOffset)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

describe("reading the selection", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges()
    document.body.innerHTML = ""
  })

  it("returns the page and the text of a selection inside one page", () => {
    const viewer = renderPages()
    const read = readSelection(select("a", 5, "b", 37), viewer)
    expect(read.kind).toBe("ok")
    if (read.kind !== "ok") return
    expect(read.selection).toEqual({ page: 25, text: "€9.0 billion and undrawn committed facilities of €7.6 billion." })
  })

  it("refuses a selection that spans two pages", () => {
    const viewer = renderPages()
    expect(readSelection(select("b", 0, "c", 9), viewer)).toEqual({ kind: "several-pages" })
  })

  it("refuses a selection that leaves the text layer", () => {
    const viewer = renderPages()
    expect(readSelection(select("c", 0, "outside", 4), viewer)).toEqual({ kind: "several-pages" })
  })

  it("ignores a collapsed selection and one outside the viewer", () => {
    const viewer = renderPages()
    expect(readSelection(select("a", 3, "a", 3), viewer)).toEqual({ kind: "none" })
    expect(readSelection(select("elsewhere", 0, "elsewhere", 9), viewer)).toEqual({ kind: "none" })
    expect(readSelection(null, viewer)).toEqual({ kind: "none" })
  })

  it("finds the page of any node in a text layer, and none elsewhere", () => {
    renderPages()
    expect(pageOf(document.getElementById("c")!.firstChild)).toBe(26)
    expect(pageOf(document.getElementById("outside"))).toBeNull()
  })
})

describe("normaliseSelectedText", () => {
  it("joins a word split at a line end and collapses whitespace", () => {
    expect(normaliseSelectedText("the opera-\ntional   facilities\n\nof")).toBe("the operational facilities of")
  })

  it("keeps a real hyphen and removes soft hyphens", () => {
    expect(normaliseSelectedText("year-on-year Euro­pe")).toBe("year-on-year Europe")
  })
})
