import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PageRail } from "./PageRail"
import { pageAt, railPosition, tickPages } from "./rail"

describe("rail geometry", () => {
  it("maps the first and last page to the ends", () => {
    expect(railPosition(1, 588)).toBe(0)
    expect(railPosition(588, 588)).toBe(1)
    expect(railPosition(295, 589)).toBe(0.5)
  })

  it("handles a one-page document and out-of-range pages", () => {
    expect(railPosition(1, 1)).toBe(0)
    expect(railPosition(900, 588)).toBe(1)
  })

  it("turns a click height back into a page", () => {
    expect(pageAt(0, 588)).toBe(1)
    expect(pageAt(1, 588)).toBe(588)
    expect(pageAt(railPosition(195, 588), 588)).toBe(195)
    expect(pageAt(-0.2, 588)).toBe(1)
  })

  it("spreads about 80 ticks over the document, first and last page included", () => {
    const ticks = tickPages(588)
    expect(ticks[0]).toBe(1)
    expect(ticks.at(-1)).toBe(588)
    expect(ticks.length).toBeGreaterThan(70)
    expect(ticks.length).toBeLessThan(90)
    expect(tickPages(3)).toEqual([1, 2, 3])
  })
})

describe("PageRail", () => {
  it("marks cited pages and the current page from the real page count", () => {
    render(<PageRail pages={588} current={195} cited={[25, 195, 195]} onPage={vi.fn()} />)
    expect(screen.getAllByTestId("rail-cited")).toHaveLength(2)
    expect(screen.getByTestId("rail-current").style.top).toBe(`${(194 / 587) * 100}%`)
    expect(screen.getByRole("button", { name: "Jump to page: page 195 of 588, 2 cited" })).toBeInTheDocument()
  })

  it("jumps to the page at the clicked height", () => {
    const onPage = vi.fn()
    render(<PageRail pages={588} current={1} cited={[]} onPage={onPage} />)
    const rail = screen.getByRole("button", { name: /Jump to page/ })
    rail.getBoundingClientRect = () => ({ top: 100, height: 500, bottom: 600, left: 0, right: 20, width: 20, x: 0, y: 100, toJSON: () => ({}) })
    fireEvent.click(rail, { clientY: 350 })
    expect(onPage).toHaveBeenCalledWith(pageAt(0.5, 588))
  })
})
