import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { DOCUMENT, server } from "../test/server"
import { DocumentPicker } from "./DocumentPicker"

describe("DocumentPicker", () => {
  it("lists indexed documents and opens the one chosen", async () => {
    const onOpen = vi.fn()
    render(<DocumentPicker onOpen={onOpen} />)

    const button = await screen.findByRole("button", { name: /Sample Annual Report 2026/ })
    expect(button).toHaveTextContent("120 passages indexed")
    await userEvent.click(button)

    expect(onOpen).toHaveBeenCalledWith(DOCUMENT)
  })

  it("explains what to do when nothing is indexed", async () => {
    server.use(http.get("*/api/documents", () => HttpResponse.json([])))
    render(<DocumentPicker onOpen={vi.fn()} />)
    expect(await screen.findByText(/No report is indexed yet/)).toBeInTheDocument()
  })

  it("shows the error and retries", async () => {
    server.use(http.get("*/api/documents", () => HttpResponse.json({}, { status: 500 }), { once: true }))
    render(<DocumentPicker onOpen={vi.fn()} />)

    expect(await screen.findByRole("alert")).toHaveTextContent(/error \(500\)/)
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("button", { name: /Sample Annual Report 2026/ })).toBeInTheDocument()
  })
})
