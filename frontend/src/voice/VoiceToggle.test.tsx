import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DocumentInfo } from "../api/types"
import { DOCUMENT, server } from "../test/server"
import { Workspace } from "../workspace/Workspace"

vi.mock("../pdf/PdfViewer", () => ({ PdfViewer: () => <p>viewer</p> }))

afterEach(() => window.localStorage.clear())

/** Turns the premium voice on; the returned spy says when the app has asked for the config. */
function premiumVoiceOn() {
  const asked = vi.fn()
  server.use(http.get("*/api/config", () => {
    asked()
    return HttpResponse.json({ uploadsEnabled: true, maxUploadMb: 50, premiumVoice: true })
  }))
  return asked
}

describe("Voice: Browser / ElevenLabs", () => {
  it("defaults to ElevenLabs on a built-in report when the server has it, and remembers a switch to Browser", async () => {
    premiumVoiceOn()
    const { unmount } = render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    expect(await screen.findByRole("radio", { name: "ElevenLabs voice" })).toBeChecked()
    await userEvent.click(screen.getByRole("radio", { name: "Browser voice (free, on this device)" }))
    unmount()

    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    expect(await screen.findByRole("radio", { name: "Browser voice (free, on this device)" })).toBeChecked()
  })

  it("is not offered without the premium voice on the server", async () => {
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    await screen.findByText("Grounded in report")
    expect(screen.queryByRole("radio", { name: "ElevenLabs voice" })).toBeNull()
  })

  it("is never offered for an uploaded report: its text stays with the browser voice", async () => {
    const asked = premiumVoiceOn()
    const mine: DocumentInfo = { docId: "upload-abc", title: "Mine", chunks: 3, source: "upload", pages: 3 }
    render(<Workspace document={mine} onClose={vi.fn()} />)
    await vi.waitFor(() => expect(asked).toHaveBeenCalled())
    await screen.findByText("Grounded in report")
    expect(screen.queryByRole("radio", { name: "ElevenLabs voice" })).toBeNull()
  })
})
