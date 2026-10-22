import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import type { UploadJob } from "../api/types"
import { server } from "../test/server"
import { Processing } from "./Processing"

const UPLOAD = { jobId: "j1", docId: "upload-abc", title: "Annual Report 2025", state: "queued" as const }

function job(overrides: Partial<UploadJob>): UploadJob {
  return { jobId: "j1", docId: "upload-abc", title: "Annual Report 2025", state: "queued", step: null, done: 0,
           total: 0, error: null, queuePosition: null, ...overrides }
}

/** The job answers these states in turn, then keeps answering the last one. */
function jobGoesThrough(states: (UploadJob | "error")[]) {
  let call = 0
  server.use(http.get("*/api/uploads/j1", () => {
    const next = states[Math.min(call++, states.length - 1)]
    return next === "error" ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json(next)
  }))
}

describe("Processing", () => {
  it("shows the queue, the reading and indexing steps with progress, then opens the report", async () => {
    const onReady = vi.fn()
    jobGoesThrough([
      job({ state: "queued", queuePosition: 2 }),
      job({ state: "reading", step: "Reading 3 pages", done: 1, total: 3 }),
      job({ state: "indexing", step: "Indexing", done: 64, total: 128 }),
      job({ state: "ready", done: 128, total: 128 }),
    ])
    server.use(http.get("*/api/documents/upload-abc", () =>
      HttpResponse.json({ docId: "upload-abc", title: "Annual Report 2025", chunks: 128, source: "upload" })))
    render(<Processing upload={UPLOAD} onReady={onReady} onBack={vi.fn()} pollMs={20} />)

    expect(await screen.findByText("Waiting: 2 uploads ahead")).toBeInTheDocument()
    expect(await screen.findByText("Reading 3 pages")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Processing progress" })).toHaveAttribute("aria-valuenow", "33")
    expect(await screen.findByText("Indexing")).toBeInTheDocument()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ docId: "upload-abc" })))
  })

  it("says why it failed and offers another file", async () => {
    const onBack = vi.fn()
    jobGoesThrough([job({
      state: "failed",
      error: "Only 1 of 10 pages have a text layer. This looks like a scanned document, and ReportLens cannot read scanned pages (there is no OCR).",
    })])
    render(<Processing upload={UPLOAD} onReady={vi.fn()} onBack={onBack} pollMs={20} />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Only 1 of 10 pages have a text layer")
    await userEvent.click(screen.getByRole("button", { name: "Choose another file" }))
    expect(onBack).toHaveBeenCalled()
  })

  it("keeps polling when the server does not answer for a moment", async () => {
    const onReady = vi.fn()
    jobGoesThrough(["error", job({ state: "ready" })])
    server.use(http.get("*/api/documents/upload-abc", () =>
      HttpResponse.json({ docId: "upload-abc", title: "t", chunks: 1, source: "upload" })))
    render(<Processing upload={UPLOAD} onReady={onReady} onBack={vi.fn()} pollMs={20} />)

    expect(await screen.findByText(/Lost contact with the server; still trying/)).toBeInTheDocument()
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled())
  })
})
