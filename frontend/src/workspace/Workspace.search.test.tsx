import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { assistantMessage, DOCUMENT, server } from "../test/server"
import { Workspace } from "./Workspace"

// The viewer is a stand-in exposing its props (pdf.js needs a canvas); the search itself
// runs for real over a fake pdf.js document.
const viewer = vi.hoisted(() => ({ props: null as null | Record<string, any> }))
vi.mock("../pdf/PdfViewer", () => ({
  PdfViewer: (props: Record<string, any>) => {
    viewer.props = props
    return <p>{props.notice ?? ""}</p>
  },
}))

const PAGES: Record<number, { str: string; hasEOL?: boolean }[]> = {
  1: [{ str: "Strategic report", hasEOL: true }],
  2: [{ str: "We are partnering with AST SpaceMobile on satellites.", hasEOL: true }],
  3: [], // a scanned page: no text layer
  4: [{ str: 'Footnote <img src=x onerror="alert(1)"> satellites ahead.', hasEOL: true }],
}

const fakePdf = {
  numPages: 4,
  getPage: async (page: number) => ({ getTextContent: async () => ({ items: PAGES[page] }) }),
}

function openWorkspace() {
  render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
  act(() => {
    viewer.props!.onLoaded(4)
    viewer.props!.onDocument(fakePdf)
  })
}

async function search(query: string) {
  await userEvent.click(screen.getByRole("button", { name: "Search the report text" }))
  const panel = screen.getByRole("region", { name: "Search the report text" })
  await userEvent.type(within(panel).getByLabelText("Search the report text"), `${query}{Enter}`)
  return panel
}

describe("Report text search", () => {
  it("opens from the toolbar with an empty field, lists matches with context and jumps to them", async () => {
    openWorkspace()
    await userEvent.click(screen.getByRole("button", { name: "Search the report text" }))
    const panel = screen.getByRole("region", { name: "Search the report text" })
    expect(within(panel).getByLabelText("Search the report text")).toHaveValue("")
    await userEvent.type(within(panel).getByLabelText("Search the report text"), "SATELLITES{Enter}")

    expect(await within(panel).findByText(/2 matches on 2 pages/)).toBeInTheDocument()
    expect(within(panel).getByText(/1 page has no text layer \(scanned\)/)).toBeInTheDocument()
    const result = within(panel).getAllByRole("button", { name: /p\. 2/ })[0]
    expect(result).toHaveTextContent("…We are partnering with AST SpaceMobile on satellites.…")

    await userEvent.click(result)
    expect(viewer.props!.page).toBe(2)

    // The viewer delivers page 2's text: the match is marked in the text layer.
    act(() => viewer.props!.onGetTextSuccess({ items: PAGES[2], styles: {}, lang: null }))
    expect(viewer.props!.customTextRenderer({ str: PAGES[2][0].str, itemIndex: 0 }))
      .toBe('We are partnering with AST SpaceMobile on <mark class="rl-mark">satellites</mark>.')
  })

  it("shows HTML from the PDF as text, never as markup", async () => {
    openWorkspace()
    const panel = await search("onerror")
    const result = await within(panel).findByRole("button", { name: /p\. 4/ })
    expect(result).toHaveTextContent('<img src=x onerror="alert(1)">')
    expect(panel.querySelector("img")).toBeNull()
  })

  it("says so when nothing matches", async () => {
    openWorkspace()
    const panel = await search("bitcoin")
    expect(await within(panel).findByText(/No matches for “bitcoin” in the text of this report\./)).toBeInTheDocument()
  })

  it("closes and stops the search", async () => {
    openWorkspace()
    const panel = await search("satellites")
    await userEvent.click(within(panel).getByRole("button", { name: "Close search" }))
    expect(screen.queryByRole("region", { name: "Search the report text" })).not.toBeInTheDocument()
  })
})

describe("Search the report text after a refusal", () => {
  it("opens the search with an empty field, the question as a hint, on the Report tab", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () =>
      HttpResponse.json(assistantMessage({ status: "not_found", content: "Not in the passages.", citations: [],
        passages: assistantMessage().passages.map((p) => ({ ...p, cited: false })) }), { status: 201 })))
    openWorkspace()
    await userEvent.click(screen.getByRole("tab", { name: "Assistant" }))
    await userEvent.type(screen.getByLabelText("Ask about the report"), "How many bitcoins does it hold?{Enter}")

    // The toolbar has a button with the same name and action; use the one in the refusal.
    const assistant = screen.getByRole("complementary", { name: "Report assistant" })
    await userEvent.click(await within(assistant).findByRole("button", { name: "Search the report text" }))

    const panel = screen.getByRole("region", { name: "Search the report text" })
    expect(within(panel).getByLabelText("Search the report text")).toHaveValue("")
    expect(within(panel).getByLabelText("Search the report text")).toHaveFocus()
    expect(panel).toHaveTextContent("Your question: “How many bitcoins does it hold?”")
    expect(screen.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true")
  })
})
