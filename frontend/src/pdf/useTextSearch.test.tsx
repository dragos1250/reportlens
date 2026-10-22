import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { TextSource } from "./textSearch"
import type { TextItemLike } from "./textMap"
import { useTextSearch } from "./useTextSearch"

/** A 30-page fake report: "satellite" on pages 3 and 25, page 7 scanned (no text). */
function fakeSource(): TextSource & { calls: number[] } {
  const calls: number[] = []
  return {
    numPages: 30,
    calls,
    async pageText(page: number): Promise<TextItemLike[]> {
      calls.push(page)
      if (page === 7) return []
      return [{ str: page === 3 || page === 25 ? "Satellite partner on this page" : `Page ${page} text`, hasEOL: true }]
    },
  }
}

describe("useTextSearch", () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => consoleError.mockRestore())

  it("searches every page and reports progress, hits and pages without text", async () => {
    const { result } = renderHook(() => useTextSearch(fakeSource()))
    await act(() => result.current.search("SATELLITE"))
    const state = result.current.state
    expect(state.status).toBe("done")
    if (state.status !== "done") return
    expect(state.searched).toBe(30)
    expect(state.hits.map((h) => h.page)).toEqual([3, 25])
    expect(state.pagesWithoutText).toBe(1)
  })

  it("shows partial results while it is still searching", async () => {
    // Page 11 waits until the test releases it, so the state after 10 pages stays visible.
    const base = fakeSource()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const source: TextSource = {
      numPages: base.numPages,
      pageText: async (page) => {
        if (page === 11) await gate
        return base.pageText(page)
      },
    }
    const { result } = renderHook(() => useTextSearch(source))
    let running!: Promise<void>
    act(() => {
      running = result.current.search("satellite")
    })

    await waitFor(() => expect(result.current.state).toMatchObject({ status: "searching", searched: 10, total: 30 }))
    const partial = result.current.state
    expect(partial.status === "searching" && partial.hits.map((h) => h.page)).toEqual([3])

    release()
    await act(() => running)
    expect(result.current.state).toMatchObject({ status: "done", searched: 30 })
  })

  it("a new search stops the previous one", async () => {
    const source = fakeSource()
    const { result } = renderHook(() => useTextSearch(source))
    act(() => {
      void result.current.search("satellite")
    })
    await waitFor(() => expect(source.calls.length).toBeGreaterThanOrEqual(10))
    await act(() => result.current.search("partner"))
    const state = result.current.state
    expect(state.status === "done" && state.query).toBe("partner")
  })

  it("cancel and unmount stop a running search without errors", async () => {
    const source = fakeSource()
    const { result, unmount } = renderHook(() => useTextSearch(source))
    act(() => {
      void result.current.search("satellite")
    })
    await waitFor(() => expect(source.calls.length).toBeGreaterThanOrEqual(10))
    act(() => result.current.cancel())
    expect(result.current.state.status).toBe("idle")
    const seen = source.calls.length
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(source.calls.length).toBeLessThanOrEqual(seen + 1) // at most the page already requested
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("ignores a query shorter than 2 characters", async () => {
    const source = fakeSource()
    const { result } = renderHook(() => useTextSearch(source))
    await act(() => result.current.search(" a "))
    expect(result.current.state.status).toBe("idle")
    expect(source.calls).toEqual([])
  })

  it("reports a page that cannot be read", async () => {
    const source = { numPages: 2, pageText: async () => { throw new Error("broken") } }
    const { result } = renderHook(() => useTextSearch(source))
    await act(() => result.current.search("satellite"))
    expect(result.current.state).toMatchObject({ status: "error", message: "The report text could not be read. Retry." })
  })
})
