import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef } from "react"
import { describe, expect, it, vi } from "vitest"

import type { Selection } from "../api/types"
import { SelectionToolbar } from "./SelectionToolbar"

/** A viewer area with two text layers, the way react-pdf renders pages. */
function Viewer({ page = 25, onExplain = vi.fn(), onAsk = vi.fn() }: {
  page?: number
  onExplain?: (selection: Selection) => void
  onAsk?: (selection: Selection) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} data-testid="viewer">
      <div className="react-pdf__Page" data-page-number="25">
        <div className="textLayer"><span id="a">Cash €9.0 billion and undrawn committed facilities.</span></div>
      </div>
      <div className="react-pdf__Page" data-page-number="26">
        <div className="textLayer"><span id="b">Liquidity is reviewed daily.</span></div>
      </div>
      <SelectionToolbar containerRef={ref} page={page} onExplain={onExplain} onAsk={onAsk} />
    </div>
  )
}

function select(startId: string, startOffset: number, endId: string, endOffset: number) {
  const range = document.createRange()
  range.setStart(document.getElementById(startId)!.firstChild!, startOffset)
  range.setEnd(document.getElementById(endId)!.firstChild!, endOffset)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  fireEvent.pointerUp(document.getElementById(endId)!)
}

describe("SelectionToolbar", () => {
  it("offers Explain this for a selection on one page and passes its page and text", async () => {
    const onExplain = vi.fn()
    render(<Viewer onExplain={onExplain} />)
    expect(screen.queryByRole("toolbar")).toBeNull()

    select("a", 0, "a", 51)
    await userEvent.click(screen.getByRole("button", { name: /Explain this/ }))

    expect(onExplain).toHaveBeenCalledWith({ page: 25, text: "Cash €9.0 billion and undrawn committed facilities." })
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("passes the selection to Ask about this", async () => {
    const onAsk = vi.fn()
    render(<Viewer onAsk={onAsk} />)
    select("b", 0, "b", 28)
    await userEvent.click(screen.getByRole("button", { name: "Ask about this" }))
    expect(onAsk).toHaveBeenCalledWith({ page: 26, text: "Liquidity is reviewed daily." })
  })

  it("asks for a selection on one page when it spans two", () => {
    render(<Viewer />)
    select("a", 0, "b", 9)
    expect(screen.getByRole("status")).toHaveTextContent("Select text on one page.")
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("hides on Escape and when the page changes", () => {
    const { rerender } = render(<Viewer />)
    select("a", 0, "a", 20)
    expect(screen.getByRole("toolbar", { name: "Selected text" })).toBeInTheDocument()
    fireEvent.keyUp(screen.getByTestId("viewer"), { key: "Escape" })
    expect(screen.queryByRole("toolbar")).toBeNull()

    select("a", 0, "a", 20)
    expect(screen.getByRole("toolbar")).toBeInTheDocument()
    rerender(<Viewer page={26} />)
    expect(screen.queryByRole("toolbar")).toBeNull()
  })
})
