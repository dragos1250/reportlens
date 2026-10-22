import type { Conversation, DocumentInfo, Lang, Message, Selection, ServerConfig, UploadAccepted, UploadJob } from "./types"

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
  // An upload refused (too large, not a PDF, scanned): the backend says why.
  if (status === 413 || status === 422) return detail ?? "The file was not accepted."
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

  config: () => request<ServerConfig>("/config"),

  /** Any report by id, built-in or uploaded (uploaded ones are not in the list). */
  document: (docId: string) => request<DocumentInfo>(`/documents/${encodeURIComponent(docId)}`),

  /**
   * The PDF goes as the raw request body, not a multipart form; its name travels
   * URL-encoded in X-Filename and is only a display title.
   */
  upload: (file: File) =>
    request<UploadAccepted>("/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "X-Filename": encodeURIComponent(file.name) },
      body: file,
    }),

  uploadJob: (jobId: string) => request<UploadJob>(`/uploads/${encodeURIComponent(jobId)}`),

  /** Uploaded reports only; deletes their conversations too. */
  deleteDocument: async (docId: string) => {
    let response: Response
    try {
      response = await fetch(url(`/documents/${encodeURIComponent(docId)}`), { method: "DELETE" })
    } catch {
      throw new ApiError(0, "Could not reach the server. Check that the backend is running, then retry.")
    }
    if (!response.ok && response.status !== 404) throw new ApiError(response.status, describe(response.status, undefined))
  },

  /**
   * An answer read by the premium voice (MP3). The server reads the answer it wrote, by id:
   * no text is sent from here. Refusals (limits, uploaded report, service down) keep their reason.
   */
  speech: async (conversationId: string, messageId: number): Promise<Blob> => {
    const path = `/conversations/${encodeURIComponent(conversationId)}/messages/${messageId}/speech`
    let response: Response
    try {
      response = await fetch(url(path), { method: "POST", headers: { Accept: "audio/mpeg" } })
    } catch {
      throw new ApiError(0, "Could not reach the server.")
    }
    if (!response.ok) {
      let detail: string | undefined
      try {
        detail = ((await response.json()) as { detail?: string }).detail
      } catch {
        detail = undefined
      }
      throw new ApiError(response.status, detail ?? "The premium voice is not available right now.")
    }
    return response.blob()
  },

  /** Streamed by the backend with range support; pdf.js loads it in parts. */
  pdfUrl: (docId: string) => url(`/documents/${encodeURIComponent(docId)}/pdf`),
}
