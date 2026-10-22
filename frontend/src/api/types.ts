/** JSON shapes of the Spring Boot API (/api). */

export type Status = "answered" | "not_found" | "not_in_report" | "incomplete" | "invalid_output"

/** "auto" sends no language: the model answers in the language it detects. */
export type Lang = "auto" | "en" | "ro"

export interface DocumentInfo {
  docId: string
  title: string
  chunks: number
}

export interface Conversation {
  id: string
  docId: string
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
  createdAt: string
}
