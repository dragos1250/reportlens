import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { assistantMessage, CONVERSATION, DOCUMENT, OTHER_DOCUMENT, server } from "../test/server"
import { Workspace } from "./Workspace"

// The viewer is a stand-in exposing its props and a text layer (pdf.js needs a canvas).
const viewer = vi.hoisted(() => ({ props: null as null | Record<string, any> }))
vi.mock("../pdf/PdfViewer", () => ({
  PdfViewer: (props: Record<string, any>) => {
    viewer.props = props
    return (
      <div className="react-pdf__Page" data-page-number={props.page}>
        <div className="textLayer"><span id="line">Net revenue grew 2.9% to EUR 119.1 billion.</span></div>
      </div>
    )
  },
}))

const COMPARED = assistantMessage({
  content: "Sample grew 8.0% [P1]; Other grew 2.9% [P6]. The financial years differ.",
  citations: [
    { marker: "P1", docId: DOCUMENT.docId, page: 17, chunkId: "s-17" },
    { marker: "P6", docId: OTHER_DOCUMENT.docId, page: 44, chunkId: "o-44" },
  ],
  passages: [
    { marker: "P1", docId: DOCUMENT.docId, page: 17, chunkId: "s-17", text: "Revenue grew 8.0%.", cited: true },
    { marker: "P6", docId: OTHER_DOCUMENT.docId, page: 44, chunkId: "o-44", text: "Net revenue grew 2.9%.", cited: true },
  ],
})

/** Opens the workspace with two reports available and records what is posted. */
async function openComparison(answer = COMPARED) {
  const posted: { conversation?: unknown; message?: unknown } = {}
  server.use(
    http.get("*/api/documents", () => HttpResponse.json([DOCUMENT, OTHER_DOCUMENT])),
    http.post("*/api/conversations", async ({ request }) => {
      posted.conversation = await request.json()
      return HttpResponse.json({ ...CONVERSATION, compareDocId: OTHER_DOCUMENT.docId }, { status: 201 })
    }),
    http.post("*/api/conversations/:id/messages", async ({ request }) => {
      posted.message = await request.json()
      return HttpResponse.json(answer, { status: 201 })
    }),
  )
  render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
  act(() => viewer.props!.onLoaded(120))
  await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Compare with" }), OTHER_DOCUMENT.docId)
  return posted
}

async function ask(question: string) {
  await userEvent.type(screen.getByLabelText("Ask about the report"), question)
  await userEvent.click(screen.getByRole("button", { name: /^Ask/ }))
}

describe("Compare two reports", () => {
  it("starts a comparison and labels each citation with its report", async () => {
    const posted = await openComparison()
    expect(screen.getByRole("group", { name: "Report shown" })).toBeInTheDocument()
    expect(screen.getByText(/The reports may cover different financial years/)).toBeInTheDocument()

    await ask("How did revenue change?")
    expect(posted.conversation).toEqual({ docId: DOCUMENT.docId, compareDocId: OTHER_DOCUMENT.docId })
    expect(posted.message).toEqual({ question: "How did revenue change?", lang: null })

    const answer = (await screen.findByText(/The financial years differ\./)).closest("p")!
    expect(within(answer).getByRole("button", { name: "Show page 17 of Sample Annual Report 2026" })).toBeInTheDocument()
    expect(within(answer).getByRole("button", { name: "Show page 44 of Other Telecom" })).toHaveTextContent("Other Telecomp. 44")
  })

  it("switches the viewer to the cited report and page", async () => {
    await openComparison()
    await ask("Revenue?")
    await userEvent.click(await screen.findByRole("button", { name: "Show page 44 of Other Telecom" }))

    expect(viewer.props!.fileUrl).toContain(`/api/documents/${OTHER_DOCUMENT.docId}/pdf`)
    expect(viewer.props!.page).toBe(44)
    expect(screen.getByRole("button", { name: "Other Telecom", pressed: true })).toBeInTheDocument()

    // Back to the first report: it kept its own page.
    await userEvent.click(screen.getByRole("button", { name: "Sample Annual Report 2026", pressed: false }))
    expect(viewer.props!.fileUrl).toContain(`/api/documents/${DOCUMENT.docId}/pdf`)
    expect(viewer.props!.page).toBe(1)
  })

  it("says calmly which report does not cover a partial answer", async () => {
    await openComparison(assistantMessage({
      status: "partial",
      content: "Other mentions satellites [P1]; the passages of the other report do not.",
      citations: [{ marker: "P1", docId: OTHER_DOCUMENT.docId, page: 60, chunkId: "o-60" }],
      passages: [{ marker: "P1", docId: OTHER_DOCUMENT.docId, page: 60, chunkId: "o-60", text: "Satellites.", cited: true }],
    }))
    await ask("Satellites?")

    expect(await screen.findByText(/The passages checked in Sample Annual Report 2026 do not/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show page 60 of Other Telecom" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("sends a selection with the report it was made in", async () => {
    const posted = await openComparison(assistantMessage({ status: "explained", content: "It grew.", citations: [], passages: [] }))
    await userEvent.click(screen.getByRole("button", { name: "Other Telecom" }))

    const line = document.getElementById("line")!.firstChild!
    const range = document.createRange()
    range.setStart(line, 0)
    range.setEnd(line, 43)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.pointerUp(document.getElementById("line")!)
    await userEvent.click(screen.getByRole("button", { name: /Explain this/ }))

    await screen.findByText("It grew.")
    expect(posted.message).toEqual({
      question: null, lang: null,
      selection: { docId: OTHER_DOCUMENT.docId, page: 1, text: "Net revenue grew 2.9% to EUR 119.1 billion." },
    })
    expect(screen.getByRole("button", { name: "Show the selection on page 1 of Other Telecom" })).toBeInTheDocument()
  })
})
