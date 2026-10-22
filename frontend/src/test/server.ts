import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import type { Conversation, DocumentInfo, Message } from "../api/types"

export const DOCUMENT: DocumentInfo = {
  docId: "sample-report",
  title: "Sample Annual Report 2026",
  chunks: 120,
}

/** A second report, for comparisons. */
export const OTHER_DOCUMENT: DocumentInfo = {
  docId: "other-report",
  title: "Other Telecom AG - Annual Report 2025",
  chunks: 90,
}

export const CONVERSATION: Conversation = {
  id: "11111111-1111-1111-1111-111111111111",
  docId: DOCUMENT.docId,
  compareDocId: null,
  title: null,
  createdAt: "2026-10-22T10:00:00Z",
}

export function assistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 2,
    role: "assistant",
    content: "Revenue grew 8.0% to €40.5 billion [P2].",
    lang: null,
    status: "answered",
    citations: [{ marker: "P2", docId: DOCUMENT.docId, page: 17, chunkId: "sample-report-p0017-c000" }],
    passages: [
      { marker: "P1", docId: DOCUMENT.docId, page: 11, chunkId: "sample-report-p0011-c004", text: "Total revenue grew 8.0%.", cited: false },
      { marker: "P2", docId: DOCUMENT.docId, page: 17, chunkId: "sample-report-p0017-c000", text: "Total revenue: Increased 8.0% to €40.5 billion.", cited: true },
    ],
    costUsd: 0.000186,
    model: "gpt-6-luna",
    selection: null,
    createdAt: "2026-10-22T10:00:05Z",
    ...overrides,
  }
}

export const handlers = [
  http.get("*/api/documents", () => HttpResponse.json([DOCUMENT])),
  // Uploads are off unless a test turns them on (as on a server without UPLOADS_ENABLED).
  http.get("*/api/config", () => HttpResponse.json({ uploadsEnabled: false, maxUploadMb: 50 })),
  http.post("*/api/conversations", () => HttpResponse.json(CONVERSATION, { status: 201 })),
  http.post("*/api/conversations/:id/messages", () => HttpResponse.json(assistantMessage(), { status: 201 })),
]

export const server = setupServer(...handlers)
