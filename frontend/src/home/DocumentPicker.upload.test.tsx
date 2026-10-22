import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { readUploads, rememberUpload } from "../lib/myUploads"
import { server } from "../test/server"
import { DocumentPicker } from "./DocumentPicker"

function uploadsOn() {
  server.use(http.get("*/api/config", () => HttpResponse.json({ uploadsEnabled: true, maxUploadMb: 1 })))
}

const pdf = (name = "Annual Report 2025.pdf", size = 20) =>
  new File([new Uint8Array(size).fill(37)], name, { type: "application/pdf" })

afterEach(() => window.localStorage.clear())

describe("Uploading a report", () => {
  it("is not offered when the server has uploads off", async () => {
    render(<DocumentPicker onOpen={vi.fn()} />)
    await screen.findByRole("button", { name: /Sample Annual Report 2026/ })
    expect(screen.queryByRole("button", { name: "Upload a report" })).toBeNull()
  })

  it("sends the PDF as the raw body with its name, and hands the job on", async () => {
    uploadsOn()
    let sent: { type: string | null; name: string | null; size: number } | undefined
    server.use(http.post("*/api/uploads", async ({ request }) => {
      sent = { type: request.headers.get("content-type"), name: request.headers.get("x-filename"),
               size: (await request.arrayBuffer()).byteLength }
      return HttpResponse.json({ jobId: "j1", docId: "upload-abc", title: "Annual Report 2025", state: "queued" },
                               { status: 202 })
    }))
    const onUploaded = vi.fn()
    render(<DocumentPicker onOpen={vi.fn()} onUploaded={onUploaded} />)
    await screen.findByRole("button", { name: "Upload a report" })
    expect(screen.getByText(/do not upload confidential documents/)).toBeInTheDocument()

    await userEvent.upload(screen.getByLabelText("PDF report to upload"), pdf())

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ jobId: "j1" })))
    expect(sent).toEqual({ type: "application/pdf", name: "Annual%20Report%202025.pdf", size: 20 })
  })

  it("stops a file that is not a PDF or is too large before sending it", async () => {
    uploadsOn()
    const posted = vi.fn()
    server.use(http.post("*/api/uploads", () => { posted(); return HttpResponse.json({}, { status: 202 }) }))
    render(<DocumentPicker onOpen={vi.fn()} />)
    const input = await screen.findByLabelText("PDF report to upload")
    const user = userEvent.setup({ applyAccept: false })

    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PDF file.")
    await user.upload(input, pdf("big.pdf", 1024 * 1024 + 1))
    expect(await screen.findByRole("alert")).toHaveTextContent("The file is larger than 1 MB.")
    expect(posted).not.toHaveBeenCalled()
  })

  it("shows the server's reason when it refuses the file", async () => {
    uploadsOn()
    server.use(http.post("*/api/uploads", () =>
      HttpResponse.json({ detail: "This file is not a PDF. Upload a PDF report." }, { status: 422 })))
    render(<DocumentPicker onOpen={vi.fn()} />)
    await userEvent.upload(await screen.findByLabelText("PDF report to upload"), pdf())
    expect(await screen.findByRole("alert")).toHaveTextContent("This file is not a PDF. Upload a PDF report.")
  })
})

describe("Your uploads", () => {
  it("lists the uploads still on the server, forgets expired ones, and deletes on request", async () => {
    rememberUpload({ docId: "upload-gone", title: "Expired" })
    rememberUpload({ docId: "upload-abc", title: "Mine" })
    const deleted = vi.fn()
    server.use(
      http.get("*/api/documents/upload-abc", () => HttpResponse.json(
        { docId: "upload-abc", title: "Mine", chunks: 8, source: "upload", pages: 9 })),
      http.get("*/api/documents/upload-gone", () => HttpResponse.json({ detail: "unknown" }, { status: 404 })),
      http.delete("*/api/documents/upload-abc", () => { deleted(); return new HttpResponse(null, { status: 204 }) }),
    )
    const onOpen = vi.fn()
    render(<DocumentPicker onOpen={onOpen} />)

    const section = await screen.findByRole("region", { name: "Your uploads" })
    expect(within(section).getByRole("button", { name: /^Mine/ })).toHaveTextContent("9 pages")
    expect(within(section).queryByText("Expired")).toBeNull()
    expect(readUploads().map((u) => u.docId)).toEqual(["upload-abc"])

    await userEvent.click(within(section).getByRole("button", { name: /^Mine/ }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ docId: "upload-abc" }))

    await userEvent.click(within(section).getByRole("button", { name: "Delete Mine" }))
    await vi.waitFor(() => expect(deleted).toHaveBeenCalled())
    expect(screen.queryByRole("region", { name: "Your uploads" })).toBeNull()
    expect(readUploads()).toEqual([])
  })
})
