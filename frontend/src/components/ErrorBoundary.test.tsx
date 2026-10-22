import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ErrorBoundary } from "./ErrorBoundary"

// A flag, not a countdown: after a render error React retries the render once before
// handing over to the boundary, so "fail once" would recover on its own.
let broken = false
function Fragile() {
  if (broken) throw new Error("render failed")
  return <p>Working content</p>
}

describe("ErrorBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {}) // React logs caught errors
  })
  afterEach(() => {
    consoleError.mockRestore()
    vi.unstubAllGlobals()
  })

  it("renders its children when nothing fails", () => {
    broken = false
    render(<ErrorBoundary name="ReportLens"><Fragile /></ErrorBoundary>)
    expect(screen.getByText("Working content")).toBeInTheDocument()
  })

  it("shows a calm message with Reload instead of a blank screen", () => {
    broken = true
    render(<ErrorBoundary name="The assistant" onReload={vi.fn()}><Fragile /></ErrorBoundary>)
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("The assistant stopped working")
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
    expect(alert.innerHTML).not.toMatch(/red/)
  })

  it("a panel boundary remounts its children on Reload", async () => {
    broken = true
    const onReload = vi.fn()
    render(<ErrorBoundary name="The assistant" onReload={onReload}><Fragile /></ErrorBoundary>)
    broken = false // the cause is gone; Reload must show the content again
    await userEvent.click(screen.getByRole("button", { name: "Reload" }))
    expect(onReload).toHaveBeenCalled()
    expect(screen.getByText("Working content")).toBeInTheDocument()
  })

  it("the app boundary reloads the page", async () => {
    broken = true
    const reload = vi.fn()
    vi.stubGlobal("location", { ...window.location, reload })
    render(<ErrorBoundary name="ReportLens"><Fragile /></ErrorBoundary>)
    await userEvent.click(screen.getByRole("button", { name: "Reload" }))
    expect(reload).toHaveBeenCalled()
  })
})
