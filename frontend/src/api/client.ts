import type { Conversation, DocumentInfo, Lang, Message, Selection } from "./types"

/** A failed request, with a message the UI can show as is. status 0 = no response at all. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Relative /api paths: the dev server proxies them to Spring Boot (same origin, no CORS). */
function url(path: string): string {
  return new URL(`/api${path}`, window.location.href).toString()
}

function describe(status: number, detail: string | undefined): string {
  if (status === 400) return `The request was not accepted${detail ? `: ${detail}` : "."}`
  if (status === 404) return detail ?? "Not found."
  // Usage limits: the backend says which one and when to try again.
  if (status === 429) return detail ?? "Too many questions. Wait a moment, then ask again."
  if (status === 502) return "The answer service is not responding. Check that the AI service is running, then retry."
  return `The server answered with an error (${status}). Retry in a moment.`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url(path), { ...init, headers: { Accept: "application/json", ...init?.headers } })
  } catch {
    throw new ApiError(0, "Could not reach the server. Check that the backend is running, then retry.")
  }
  if (!response.ok) {
    let detail: string | undefined
    try {
      detail = ((await response.json()) as { detail?: string }).detail
    } catch {
      detail = undefined // body was not JSON
    }
    throw new ApiError(response.status, describe(response.status, detail))
  }
  return (await response.json()) as T
}

function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export const api = {
  documents: () => request<DocumentInfo[]>("/documents"),

  /** With compareDocId, every question in the conversation compares the two reports. */
  startConversation: (docId: string, compareDocId: string | null = null) =>
    postJson<Conversation>("/conversations", { docId, ...(compareDocId ? { compareDocId } : {}) }),

  /**
   * Returns the assistant's message; the question is stored by the backend too. With a
   * selection and no question: "Explain this"; with both: "Ask about this" (answered from the
   * selection only).
   */
  ask: (conversationId: string, question: string | null, lang: Lang, selection: Selection | null = null) =>
    postJson<Message>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
      question,
      lang: lang === "auto" ? null : lang,
      ...(selection ? { selection } : {}),
    }),

  /** Streamed by the backend with range support; pdf.js loads it in parts. */
  pdfUrl: (docId: string) => url(`/documents/${encodeURIComponent(docId)}/pdf`),
}
