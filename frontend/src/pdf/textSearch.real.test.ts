// @vitest-environment node
/**
 * The search on the real report's text, extracted by pdf.js from data/raw. The PDF is not
 * in git (derived data stays out of the repository), so this test is skipped when the file
 * is missing: run scripts/download_reports.py first.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"

import { searchPage, textSourceFor, type TextSource } from "./textSearch"

const PDF = resolve(__dirname, "../../../data/raw/vodafone-20f-fy26.pdf")

async function searchAll(source: TextSource, query: string) {
  const hits = []
  for (let page = 1; page <= source.numPages; page++) hits.push(...searchPage(page, await source.pageText(page), query))
  return hits
}

describe.skipIf(!existsSync(PDF))("text search on the real report", () => {
  let source: TextSource

  beforeAll(async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(PDF)) }).promise
    source = textSourceFor(pdf)
  }, 60_000)

  it("finds a figure with its punctuation", async () => {
    const hits = await searchAll(source, "€7.6 billion")
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.match === "€7.6 billion")).toBe(true)
  }, 60_000)

  it("ignores case but keeps the original case in the context", async () => {
    const lower = await searchAll(source, "ast spacemobile")
    const upper = await searchAll(source, "AST SPACEMOBILE")
    expect(lower.length).toBeGreaterThan(0)
    expect(upper.map((h) => [h.page, h.start])).toEqual(lower.map((h) => [h.page, h.start]))
    expect(lower[0].match).toBe("AST SpaceMobile")
  }, 60_000)

  it("finds nothing for a term the report does not contain", async () => {
    expect(await searchAll(source, "bitcoin")).toEqual([])
  }, 60_000)
})
