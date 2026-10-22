import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { assistantMessage, server } from "../test/server"
import { fakeAudio, fakeSpeechSynthesis } from "./fakes"
import { ReadAloud } from "./ReadAloud"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const romanian = assistantMessage({
  id: 7, lang: null, spokenText: "Veniturile au crescut cu 8%.", spokenLang: "ro",
  content: "Veniturile au crescut cu 8% [P2].",
})
const english = assistantMessage({ id: 8, lang: "ro", spokenText: "Revenue grew 8%.", spokenLang: "en" })

describe("Read aloud with the browser voice", () => {
  it("reads a Romanian answer in Romanian although the selector was on Auto", async () => {
    const spoken = fakeSpeechSynthesis(["en-US", "ro-RO"])
    render(<ReadAloud message={romanian} conversationId="c1" provider="browser" />)
    await userEvent.click(screen.getByRole("button", { name: "Read the answer aloud (Romanian)" }))
    await vi.waitFor(() => expect(spoken).toEqual([
      { text: "Veniturile au crescut cu 8%.", lang: "ro-RO", voice: "Voice ro-RO" },
    ]))
  })

  it("reads an English answer in English although the selector was on RO", async () => {
    const spoken = fakeSpeechSynthesis(["ro-RO", "en-GB"])
    render(<ReadAloud message={english} conversationId="c1" provider="browser" />)
    await userEvent.click(screen.getByRole("button", { name: "Read the answer aloud (English)" }))
    await vi.waitFor(() => expect(spoken[0]).toMatchObject({ lang: "en-US", voice: "Voice en-GB" }))
  })

  it("says that no Romanian voice is installed instead of reading with another voice", async () => {
    const spoken = fakeSpeechSynthesis(["en-US"])
    render(<ReadAloud message={romanian} conversationId="c1" provider="browser" />)
    await userEvent.click(screen.getByRole("button", { name: /Read the answer aloud/ }))
    expect(await screen.findByRole("status")).toHaveTextContent("No Romanian voice installed")
    expect(spoken).toEqual([])
  })
})

describe("Read aloud with ElevenLabs", () => {
  it("asks the server for the answer by id, sends no text, and plays the audio", async () => {
    fakeSpeechSynthesis(["ro-RO"])
    const audio = fakeAudio()
    let request: { url: string; body: string } | undefined
    server.use(http.post("*/api/conversations/:id/messages/:messageId/speech", async ({ request: r }) => {
      request = { url: new URL(r.url).pathname, body: await r.text() }
      return new HttpResponse(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/mpeg" } })
    }))
    render(<ReadAloud message={romanian} conversationId="c1" provider="elevenlabs" />)
    await userEvent.click(screen.getByRole("button", { name: /Read the answer aloud/ }))

    await vi.waitFor(() => expect(audio.played).toBe(1))
    expect(request).toEqual({ url: "/api/conversations/c1/messages/7/speech", body: "" })
  })

  it.each([
    [429, "Your daily premium voice limit is reached; the browser voice is used instead."],
    [503, "The premium voice is not available right now."],
  ])("falls back to the browser voice on %i and says why", async (status, detail) => {
    const spoken = fakeSpeechSynthesis(["ro-RO"])
    server.use(http.post("*/api/conversations/:id/messages/:messageId/speech", () =>
      HttpResponse.json({ detail }, { status })))
    render(<ReadAloud message={romanian} conversationId="c1" provider="elevenlabs" />)
    await userEvent.click(screen.getByRole("button", { name: /Read the answer aloud/ }))

    await vi.waitFor(() => expect(spoken).toHaveLength(1))
    expect(screen.getByRole("status")).toHaveTextContent(`${detail} Using the browser voice.`)
  })
})
