import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DOCUMENT } from "../test/server"
import { Workspace } from "./Workspace"

vi.mock("../pdf/PdfViewer", () => ({ PdfViewer: () => <p>PDF page</p> }))
vi.mock("../chat/AssistantPanel", () => ({
  AssistantPanel: () => {
    throw new Error("panel bug")
  },
}))

describe("Workspace when the assistant panel crashes", () => {
  it("keeps the report usable and shows Reload in the panel's place", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<Workspace document={DOCUMENT} onClose={vi.fn()} />)

    expect(screen.getByText("PDF page")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Report" })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("The assistant stopped working")
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
