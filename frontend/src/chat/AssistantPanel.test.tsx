import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import type { Passage } from "../api/types"
import { assistantMessage, server } from "../test/server"
import { AssistantPanel } from "./AssistantPanel"
import { useConversation } from "./useConversation"

/** The panel with the real conversation hook, against the mock API. */
function Harness({ onCite = vi.fn(), onSearchReport = vi.fn() }: {
  onCite?: (p: Passage) => void
  onSearchReport?: (question: string) => void
}) {
  const conversation = useConversation("sample-report")
  const [active, setActive] = useState<string | null>(null)
  return (
    <AssistantPanel
      turns={conversation.turns}
      busy={conversation.busy}
      activeChunkId={active}
      onAsk={conversation.ask}
      onRetry={conversation.retry}
      onCite={(p) => { setActive(p.chunkId); onCite(p) }}
      onSearchReport={onSearchReport}
    />
  )
}

async function ask(question: string) {
  await userEvent.type(screen.getByLabelText("Ask about the report"), question)
  await userEvent.click(screen.getByRole("button", { name: /Ask/ }))
}

describe("AssistantPanel", () => {
  it("shows loading, then the answer with a clickable citation and its sources", async () => {
    const onCite = vi.fn()
    server.use(http.post("*/api/conversations/:id/messages", async () => {
      await delay(100) // keep the loading state visible long enough to check it
      return HttpResponse.json(assistantMessage(), { status: 201 })
    }))
    render(<Harness onCite={onCite} />)
    await ask("What was total revenue?")

    expect(await screen.findByText("Searching the report…")).toBeInTheDocument()
    const chip = await screen.findByRole("button", { name: "Show page 17" })
    expect(screen.getByText("2 passages checked, 1 cited")).toBeInTheDocument()
    expect(screen.getByText(/gpt-6-luna · \$0\.0002/)).toBeInTheDocument()

    await userEvent.click(chip)
    expect(onCite).toHaveBeenCalledWith(expect.objectContaining({ page: 17, marker: "P2" }))
    expect(chip).toHaveAttribute("aria-pressed", "true")

    const sources = screen.getByRole("region", { name: "Sources" })
    await userEvent.click(within(sources).getByRole("button", { name: /Show page 17/ }))
    expect(onCite).toHaveBeenCalledTimes(2)
  })

  it("sends the chosen answer language", async () => {
    let sent: { lang: string | null } | undefined
    server.use(http.post("*/api/conversations/:id/messages", async ({ request }) => {
      sent = (await request.json()) as typeof sent
      return HttpResponse.json(assistantMessage(), { status: 201 })
    }))
    render(<Harness />)
    await userEvent.click(screen.getByRole("radio", { name: "Romanian" }))
    await ask("Care au fost veniturile?")
    await screen.findByRole("button", { name: "Show page 17" })
    expect(sent?.lang).toBe("ro")
  })

  it("shows not_found calmly with the checked pages, and Rephrase refills the question", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () =>
      HttpResponse.json(assistantMessage({ status: "not_found", content: "The passages do not contain this.", citations: [],
        passages: assistantMessage().passages.map((p) => ({ ...p, cited: false })) }), { status: 201 })))
    render(<Harness />)
    await ask("How many bitcoins does it hold?")

    expect(await screen.findByRole("heading", { name: "Not in this report" })).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument() // not styled as an error
    expect(screen.getByRole("button", { name: "Show checked page 11" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Show checked page 17" })).toBeInTheDocument()

    expect(screen.getByRole("button", { name: "Search the report text" })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Rephrase" }))
    expect(screen.getByLabelText("Ask about the report")).toHaveValue("How many bitcoins does it hold?")
    expect(screen.getByLabelText("Ask about the report")).toHaveFocus()
  })

  it("shows not_in_report without checked pages", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () =>
      HttpResponse.json(assistantMessage({ status: "not_in_report", content: "x", citations: [], passages: [],
        model: null, costUsd: 0 }), { status: 201 })))
    render(<Harness />)
    await ask("What is the capital of France?")
    expect(await screen.findByText("No passage was close enough to check.")).toBeInTheDocument()
  })

  it("explains an error and retries the same question", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () =>
      HttpResponse.json({ detail: "x" }, { status: 502 }), { once: true }))
    render(<Harness />)
    await ask("What was total revenue?")

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(/AI service is running, then retry/)
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }))
    expect(await screen.findByRole("button", { name: "Show page 17" })).toBeInTheDocument()
  })

  it("does not send an empty question and submits with Enter", async () => {
    render(<Harness />)
    expect(screen.getByRole("button", { name: /Ask/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText("Ask about the report"), "What was total revenue?{Enter}")
    expect(await screen.findByRole("button", { name: "Show page 17" })).toBeInTheDocument()
    expect(screen.getByLabelText("Ask about the report")).toHaveValue("")
  })
})
