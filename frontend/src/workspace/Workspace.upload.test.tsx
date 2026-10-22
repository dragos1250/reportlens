import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { DocumentInfo } from "../api/types"
import { readUploads, rememberUpload } from "../lib/myUploads"
import { DOCUMENT, server } from "../test/server"
import { Workspace } from "./Workspace"

vi.mock("../pdf/PdfViewer", () => ({ PdfViewer: () => <p>viewer</p> }))

const MINE: DocumentInfo = {
  docId: "upload-abc", title: "Other Telecom AG - Annual Report 2025", chunks: 40, source: "upload",
  pages: 12, pagesWithoutText: 2, expiresAt: "2026-10-24T10:00:00Z",
}

afterEach(() => window.localStorage.clear())

describe("An uploaded report in the workspace", () => {
  it("says plainly what automatic indexing cannot promise, and how many pages it could not read", () => {
    render(<Workspace document={MINE} onClose={vi.fn()} />)
    const notice = screen.getByRole("region", { name: "About this uploaded report" })
    expect(notice).toHaveTextContent("headers, tables and scanned pages may be handled imperfectly")
    expect(notice).toHaveTextContent("2 pages have no text layer and cannot be searched")
    expect(notice).toHaveTextContent("deleted after 24 hours")
  })

  it("is deleted after a confirmation, forgotten here, and the workspace closes", async () => {
    rememberUpload({ docId: MINE.docId, title: MINE.title })
    const deleted = vi.fn()
    server.use(http.delete("*/api/documents/upload-abc", () => { deleted(); return new HttpResponse(null, { status: 204 }) }))
    const onClose = vi.fn()
    render(<Workspace document={MINE} onClose={onClose} />)

    await userEvent.click(screen.getByRole("button", { name: "Delete report" }))
    const notice = screen.getByRole("region", { name: "About this uploaded report" })
    expect(notice).toHaveTextContent("Delete this report and its conversations?")
    await userEvent.click(within(notice).getByRole("button", { name: "Delete" }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(deleted).toHaveBeenCalled()
    expect(readUploads()).toEqual([])
  })

  it("a built-in report shows no such notice, and can be compared with an upload from this browser", async () => {
    rememberUpload({ docId: MINE.docId, title: MINE.title })
    server.use(http.get("*/api/documents/upload-abc", () => HttpResponse.json(MINE)))
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)

    expect(screen.queryByRole("region", { name: "About this uploaded report" })).toBeNull()
    const select = await screen.findByRole("combobox", { name: "Compare with" })
    expect(within(select).getByRole("option", { name: "Other Telecom" })).toHaveValue("upload-abc")
  })
})
