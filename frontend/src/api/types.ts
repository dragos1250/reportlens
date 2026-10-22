/** JSON shapes of the Spring Boot API (/api). */

export type Status =
  | "answered" | "not_found" | "not_in_report" | "incomplete" | "invalid_output"
  // Select & explain: the model explained / said the text is not enough; the guard refused
  | "explained" | "not_enough" | "too_short" | "too_long" | "no_text"
  // Compare two reports: only one of them covers the question
  | "partial"

/**
 * Text the reader selected in the PDF, with its page (Select & explain). docId: the report it
 * comes from; absent on older messages, which means the conversation's own report.
 */
export interface Selection {
  docId?: string | null
  page: number
  text: string
}

/** "auto" sends no language: the model answers in the language it detects. */
export type Lang = "auto" | "en" | "ro"

export interface DocumentInfo {
  docId: string
  title: string
  chunks: number
  /** "builtin" reports are listed; "upload" ones open by their id only and expire. */
  source?: "builtin" | "upload"
  pages?: number | null
  /** Scanned pages: neither searched nor cited. */
  pagesWithoutText?: number | null
  expiresAt?: string | null
}

/** What this server allows (GET /api/config). */
export interface ServerConfig {
  uploadsEnabled: boolean
  maxUploadMb: number
  /** ElevenLabs is configured on the server; the browser voice works anyway. */
  premiumVoice?: boolean
}

export type UploadState = "queued" | "reading" | "indexing" | "ready" | "failed"

/** An uploaded report being processed in the background (polled every second). */
export interface UploadJob {
  jobId: string
  docId: string
  title: string
  state: UploadState
  step: string | null
  done: number
  total: number
  /** For the user: what went wrong and what to do. */
  error: string | null
  /** Uploads ahead of this one, while queued. */
  queuePosition: number | null
}

export interface UploadAccepted {
  jobId: string
  docId: string
  title: string
  state: UploadState
}

export interface Conversation {
  id: string
  docId: string
  /** The second report when the conversation compares two. */
  compareDocId: string | null
  title: string | null
  createdAt: string
}

/** A passage the answer was checked against; markers ("P1".."P5") appear in the answer text. */
export interface Passage {
  marker: string
  docId: string
  page: number
  chunkId: string
  text: string
  cited: boolean
}

export interface Citation {
  marker: string
  docId: string
  page: number
  chunkId: string
}

export interface Message {
  id: number
  role: "user" | "assistant"
  /** For the assistant: the answer with [P1].. markers. */
  content: string
  lang: string | null
  status: Status | null
  citations: Citation[]
  passages: Passage[]
  costUsd: number | null
  model: string | null
  /** Set on both messages of a Select & explain turn. */
  selection: Selection | null
  createdAt: string
  /** Answers only: what "Read aloud" reads (no [P#] markers), and its language, resolved on the server. */
  spokenText?: string | null
  spokenLang?: "ro" | "en" | null
}
