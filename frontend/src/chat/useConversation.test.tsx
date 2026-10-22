import { act, renderHook, waitFor } from "@testing-library/react"
import { delay, http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { assistantMessage, server } from "../test/server"
import { useConversation } from "./useConversation"

/** The answer arrives only when the test says so. */
function slowAnswer() {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let answered = false
  server.use(http.post("*/api/conversations/:id/messages", async () => {
    await released
    answered = true
    return HttpResponse.json(assistantMessage(), { status: 201 })
  }))
  return { release, answered: () => answered }
}

describe("useConversation with requests in flight", () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => consoleError.mockRestore())

  it("unmounting while a question is in flight drops the answer quietly", async () => {
    const server = slowAnswer()
    const { result, unmount } = renderHook(() => useConversation("sample-report"))

    let pending!: Promise<void>
    act(() => {
      pending = result.current.ask("What was total revenue?", "auto")
    })
    expect(result.current.turns[0].state).toBe("loading")

    unmount()
    server.release()
    await act(() => pending)

    expect(server.answered()).toBe(true) // the response did come back...
    expect(result.current.turns[0].state).toBe("loading") // ...and was not applied
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("an answer for the previous document never shows up after switching documents", async () => {
    const server = slowAnswer()
    const { result, rerender } = renderHook(({ docId }) => useConversation(docId), {
      initialProps: { docId: "sample-report" },
    })

    let pending!: Promise<void>
    act(() => {
      pending = result.current.ask("What was total revenue?", "auto")
    })
    rerender({ docId: "another-report" })
    await waitFor(() => expect(result.current.turns).toEqual([]))

    server.release()
    await act(() => pending)
    expect(result.current.turns).toEqual([])
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("still applies answers while mounted", async () => {
    server.use(http.post("*/api/conversations/:id/messages", async () => {
      await delay(10)
      return HttpResponse.json(assistantMessage(), { status: 201 })
    }))
    const { result } = renderHook(() => useConversation("sample-report"))
    await act(() => result.current.ask("What was total revenue?", "auto"))
    expect(result.current.turns[0].state).toBe("done")
  })
})
