import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { clampPage, ViewerToolbar } from "./ViewerToolbar"

describe("clampPage", () => {
  it.each([
    [0, 588, 1],
    [12, 588, 12],
    [999, 588, 588],
    [Number.NaN, 588, 1],
  ])("clamps %s within 1..%s to %s", (page, pages, expected) => {
    expect(clampPage(page, pages)).toBe(expected)
  })
})

describe("ViewerToolbar", () => {
  function setup(page = 1, pages: number | null = 588) {
    const onPage = vi.fn()
    const onZoom = vi.fn()
    render(<ViewerToolbar page={page} pages={pages} zoom={1} onPage={onPage} onZoom={onZoom} />)
    return { onPage, onZoom }
  }

  it("disables Previous on the first page and Next on the last", () => {
    setup(1, 3)
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled()
  })

  it("goes to a typed page, clamped to the page count", async () => {
    const { onPage } = setup(1, 588)
    const input = screen.getByLabelText("Page")
    await userEvent.clear(input)
    await userEvent.type(input, "9999{Enter}")
    expect(onPage).toHaveBeenCalledWith(588)
  })

  it("shows the real page count and zooms in steps", async () => {
    const { onZoom } = setup(5, 588)
    expect(screen.getByText("of 588")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }))
    expect(onZoom).toHaveBeenCalledWith(1.25)
  })
})
