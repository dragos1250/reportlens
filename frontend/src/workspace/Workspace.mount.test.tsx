import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DOCUMENT } from "../test/server"
import { Workspace } from "./Workspace"

// pdf.js needs a real canvas; a stand-in keeps the rest of the workspace real.
vi.mock("../pdf/PdfViewer", () => ({ PdfViewer: () => <p>page</p> }))

/**
 * Current browsers return a Promise from scrollIntoView. jsdom has no scrollIntoView at
 * all, which is why the first tests missed an effect that returned its result. Mimic
 * the browser here.
 */
function scrollIntoViewLikeABrowser() {
  Element.prototype.scrollIntoView = vi.fn(() => Promise.resolve()) as unknown as Element["scrollIntoView"]
}

describe("Workspace mounts cleanly", () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollIntoViewLikeABrowser()
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it("renders, asks a question and unmounts without any console error", async () => {
    const view = render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)
    expect(screen.getByRole("complementary", { name: "Report assistant" })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("Ask about the report"), "What was total revenue?{Enter}")
    expect(await screen.findByRole("button", { name: "Show page 17" })).toBeInTheDocument()

    act(() => view.unmount())
    expect(consoleError).not.toHaveBeenCalled()
  })
})
