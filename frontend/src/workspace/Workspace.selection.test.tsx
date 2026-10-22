import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { assistantMessage, DOCUMENT, server } from "../test/server"
import { Workspace } from "./Workspace"

const TEXT = [{ str: "Cash €9.0 billion and undrawn ", hasEOL: false }, { str: "committed facilities.", hasEOL: true }]

// The viewer is a stand-in that renders a text layer the way react-pdf does (pdf.js needs a canvas).
const viewer = vi.hoisted(() => ({ props: null as null | Record<string, any> }))
vi.mock("../pdf/PdfViewer", () => ({
  PdfViewer: (props: Record<string, any>) => {
    viewer.props = props
    return (
      <div className="react-pdf__Page" data-page-number={props.page}>
        <div className="textLayer"><span id="line">{TEXT.map((item) => item.str).join("")}</span></div>
        <p>{props.notice ?? ""}</p>
      </div>
    )
  },
}))

describe("Select & explain", () => {
  it("explains a selection from the viewer and marks it again from the quote", async () => {
    let sent: unknown
    server.use(http.post("*/api/conversations/:id/messages", async ({ request }) => {
      sent = await request.json()
      return HttpResponse.json(assistantMessage({
        status: "explained", content: "The group had €9.0 billion in cash.", citations: [], passages: [],
        selection: { page: 1, text: "€9.0 billion" },
      }), { status: 201 })
    }))
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    act(() => viewer.props!.onLoaded(3))

    const line = document.getElementById("line")!.firstChild!
    const range = document.createRange()
    range.setStart(line, 5)
    range.setEnd(line, 17)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    fireEvent.pointerUp(document.getElementById("line")!)
    await userEvent.click(screen.getByRole("button", { name: /Explain this/ }))

    expect(await screen.findByText("The group had €9.0 billion in cash.")).toBeInTheDocument()
    expect(sent).toEqual({ question: null, lang: null, selection: { docId: DOCUMENT.docId, page: 1, text: "€9.0 billion" } })

    await userEvent.click(screen.getByRole("button", { name: "Show the selection on page 1" }))
    act(() => viewer.props!.onGetTextSuccess({ items: TEXT, styles: {}, lang: null }))
    expect(viewer.props!.customTextRenderer({ str: TEXT[0].str, itemIndex: 0 }))
      .toBe('Cash <mark class="rl-mark">€9.0 billion</mark> and undrawn ')
  })
})
