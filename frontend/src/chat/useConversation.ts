import { useCallback, useRef, useState } from "react"

import { api } from "../api/client"
import type { Lang, Message } from "../api/types"

/** One question and what happened to it. */
export type Turn =
  | { id: number; question: string; lang: Lang; state: "loading" }
  | { id: number; question: string; lang: Lang; state: "done"; answer: Message }
  | { id: number; question: string; lang: Lang; state: "error"; error: string }

/**
 * Conversation with the backend for one document. The conversation is created on the
 * first question, so opening a report and leaving does not leave empty conversations.
 */
export function useConversation(docId: string) {
  const [turns, setTurns] = useState<Turn[]>([])
  const conversationId = useRef<Promise<string> | null>(null)
  const nextId = useRef(1)

  const run = useCallback(async (id: number, question: string, lang: Lang) => {
    setTurns((all) => all.map((t) => (t.id === id ? { id, question, lang, state: "loading" } : t)))
    try {
      conversationId.current ??= api.startConversation(docId).then((c) => c.id)
      const answer = await api.ask(await conversationId.current, question, lang)
      setTurns((all) => all.map((t) => (t.id === id ? { id, question, lang, state: "done", answer } : t)))
    } catch (error) {
      conversationId.current = null // a failed start must not stick
      const message = error instanceof Error ? error.message : "Something went wrong. Retry."
      setTurns((all) => all.map((t) => (t.id === id ? { id, question, lang, state: "error", error: message } : t)))
    }
  }, [docId])

  const ask = useCallback((question: string, lang: Lang) => {
    const id = nextId.current++
    setTurns((all) => [...all, { id, question, lang, state: "loading" }])
    return run(id, question, lang)
  }, [run])

  const retry = useCallback((turn: Turn) => run(turn.id, turn.question, turn.lang), [run])

  const busy = turns.some((t) => t.state === "loading")
  return { turns, ask, retry, busy }
}
