import { useCallback, useEffect, useRef, useState } from "react"

import { MIN_QUERY_LENGTH, normaliseQuery, searchPage, type SearchHit, type TextSource } from "./textSearch"

export type SearchState =
  | { status: "idle" }
  | { status: "searching" | "done"; query: string; searched: number; total: number; hits: SearchHit[]; pagesWithoutText: number }
  | { status: "error"; query: string; message: string }

/** Pages searched between two updates of the UI; the browser gets the main thread back in between. */
const PAGES_PER_STEP = 10

const yieldToBrowser = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Searches the report page by page. pdf.js extracts each page's text in its worker; only
 * the matching runs here, on a few thousand characters per page, and every few pages the
 * loop gives control back to the browser so the UI keeps responding (588 pages included).
 * A new search, cancel() or unmounting stops the running one.
 */
export function useTextSearch(source: TextSource | null) {
  const [state, setState] = useState<SearchState>({ status: "idle" })
  const generation = useRef(0)

  useEffect(() => {
    return () => {
      generation.current += 1 // stop a running search when the component goes away
    }
  }, [])

  const cancel = useCallback(() => {
    generation.current += 1
    setState({ status: "idle" })
  }, [])

  const search = useCallback(async (query: string) => {
    const run = ++generation.current
    const stale = () => generation.current !== run
    if (!source || normaliseQuery(query).length < MIN_QUERY_LENGTH) {
      setState({ status: "idle" })
      return
    }

    const total = source.numPages
    const hits: SearchHit[] = []
    let pagesWithoutText = 0
    setState({ status: "searching", query, searched: 0, total, hits: [], pagesWithoutText: 0 })
    try {
      for (let page = 1; page <= total; page++) {
        const items = await source.pageText(page)
        if (stale()) return
        if (items.every((item) => item.str.trim() === "")) pagesWithoutText += 1
        hits.push(...searchPage(page, items, query))
        if (page % PAGES_PER_STEP === 0 && page < total) {
          setState({ status: "searching", query, searched: page, total, hits: [...hits], pagesWithoutText })
          await yieldToBrowser()
          if (stale()) return
        }
      }
      setState({ status: "done", query, searched: total, total, hits, pagesWithoutText })
    } catch {
      if (!stale()) setState({ status: "error", query, message: "The report text could not be read. Retry." })
    }
  }, [source])

  return { state, search, cancel }
}
