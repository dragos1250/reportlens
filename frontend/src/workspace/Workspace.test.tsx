import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { assistantMessage, DOCUMENT, server } from "../test/server"
import { Workspace } from "./Workspace"

// pdf.js needs a real canvas; the viewer is replaced by a stand-in that exposes what the
// workspace passes to it, so the citation -> page -> highlight wiring can be tested.
const viewer = vi.hoisted(() => ({ props: null as null | Record<string, any> }))
vi.mock("../pdf/PdfViewer", () => ({
  PdfViewer: (props: Record<string, any>) => {
    viewer.props = props
    return <p>{props.notice ?? ""}</p>
  },
}))

/** Simulates pdf.js: the document loads, then the shown page's text arrives. */
function loadPage(items: { str: string; hasEOL?: boolean }[]) {
  act(() => viewer.props!.onLoaded(588))
  act(() => viewer.props!.onGetTextSuccess({ items, styles: {}, lang: null }))
}

async function askAndCite() {
  await userEvent.type(screen.getByLabelText("Ask about the report"), "What was total revenue?{Enter}")
  await userEvent.click(await screen.findByRole("button", { name: "Show page 17" }))
}

describe("Workspace citations", () => {
  beforeEach(() => {
    viewer.props = null
  })

  it("jumps to the cited page and marks the passage in the text layer", async () => {
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    act(() => viewer.props!.onLoaded(588))
    await askAndCite()

    expect(viewer.props!.page).toBe(17)
    expect(screen.getByLabelText("Page")).toHaveValue("17")

    loadPage([{ str: "Total revenue: Increased 8.0% to €40.5 billion.", hasEOL: true }])
    const html = viewer.props!.customTextRenderer({ str: "Total revenue: Increased 8.0% to €40.5 billion.", itemIndex: 0 })
    expect(html).toContain('<mark class="rl-mark">')
    expect(screen.queryByText(/Couldn’t mark the passage/)).not.toBeInTheDocument()
  })

  it("still jumps, marks nothing and says so when the passage is not on the page", async () => {
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    act(() => viewer.props!.onLoaded(588))
    await askAndCite()

    loadPage([{ str: "Something else entirely on this page." }])
    expect(viewer.props!.page).toBe(17)
    expect(viewer.props!.customTextRenderer({ str: "Something else entirely on this page.", itemIndex: 0 }))
      .not.toContain("<mark")
    expect(screen.getByText("Couldn’t mark the passage on page 17; its text is in Sources.")).toBeInTheDocument()
  })

  it("marks cited pages on the rail", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () => HttpResponse.json(assistantMessage(), { status: 201 })))
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    act(() => viewer.props!.onLoaded(588))
    await userEvent.type(screen.getByLabelText("Ask about the report"), "What was total revenue?{Enter}")
    await screen.findByRole("button", { name: "Show page 17" })
    expect(screen.getByRole("button", { name: /Jump to page: page 1 of 588, 1 cited/ })).toBeInTheDocument()
  })
})

describe("Workspace on a phone", () => {
  it("switches between Report and Assistant, and a citation opens the Report tab", async () => {
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    const reportTab = screen.getByRole("tab", { name: "Report" })
    const assistantTab = screen.getByRole("tab", { name: "Assistant" })
    expect(reportTab).toHaveAttribute("aria-selected", "true")

    await userEvent.click(assistantTab)
    expect(assistantTab).toHaveAttribute("aria-selected", "true")
    expect(document.getElementById("pane-report")).toHaveClass("hidden")

    act(() => viewer.props!.onLoaded(588))
    await askAndCite()
    expect(reportTab).toHaveAttribute("aria-selected", "true")
    expect(document.getElementById("pane-assistant")).toHaveClass("hidden")
    expect(viewer.props!.page).toBe(17)
  })
})
