import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { CONVERSATION, DOCUMENT, server } from "../test/server"
import { api, ApiError } from "./client"

describe("api client", () => {
  it("lists documents", async () => {
    expect(await api.documents()).toEqual([DOCUMENT])
  })

  it("starts a conversation for a document", async () => {
    let sent: unknown
    server.use(
      http.post("*/api/conversations", async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(CONVERSATION, { status: 201 })
      }),
    )
    expect((await api.startConversation("sample-report")).id).toBe(CONVERSATION.id)
    expect(sent).toEqual({ docId: "sample-report" })
  })

  it.each([
    ["auto", null],
    ["ro", "ro"],
    ["en", "en"],
  ] as const)("sends lang %s as %s", async (lang, expected) => {
    let sent: { question: string; lang: string | null } | undefined
    server.use(
      http.post("*/api/conversations/:id/messages", async ({ request }) => {
        sent = (await request.json()) as typeof sent
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    await api.ask(CONVERSATION.id, "Care au fost veniturile?", lang)
    expect(sent).toEqual({ question: "Care au fost veniturile?", lang: expected })
  })

  it("sends a selection with no question for Explain this", async () => {
    let sent: unknown
    server.use(
      http.post("*/api/conversations/:id/messages", async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    await api.ask(CONVERSATION.id, null, "auto", { page: 25, text: "Cash €9.0 billion." })
    expect(sent).toEqual({ question: null, lang: null, selection: { page: 25, text: "Cash €9.0 billion." } })
  })

  it("turns a 502 into a message that says what to do", async () => {
    server.use(http.post("*/api/conversations/:id/messages", () => HttpResponse.json({ detail: "x" }, { status: 502 })))
    const error = await api.ask(CONVERSATION.id, "q", "auto").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).message).toMatch(/AI service is running, then retry/)
  })

  it("keeps the backend's detail for a 400", async () => {
    server.use(
      http.post("*/api/conversations/:id/messages", () =>
        HttpResponse.json({ detail: "question must not be blank" }, { status: 400 }),
      ),
    )
    await expect(api.ask(CONVERSATION.id, " ", "auto")).rejects.toThrow("question must not be blank")
  })

  it("reports a network failure as status 0", async () => {
    server.use(http.get("*/api/documents", () => HttpResponse.error()))
    const error = (await api.documents().catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Could not reach the server/)
  })

  it("builds the PDF address under /api with the id encoded", () => {
    expect(api.pdfUrl("a b")).toMatch(/\/api\/documents\/a%20b\/pdf$/)
  })
})
