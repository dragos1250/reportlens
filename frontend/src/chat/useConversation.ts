import { useCallback, useEffect, useRef, useState } from "react"

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
  // Requests start from clicks, not from an effect, so there is no effect-local `cancelled`
  // flag to close over. Instead every request remembers the generation it started in; the
  // cleanup below moves to a new generation when the component unmounts or the document
  // changes, and answers from an old generation are dropped.
  const generation = useRef(0)

  useEffect(() => {
    return () => {
      generation.current += 1
      conversationId.current = null
      setTurns([])
    }
  }, [docId])

  const run = useCallback(async (id: number, question: string, lang: Lang) => {
    const started = generation.current
    const update = (turn: Turn) => {
      if (generation.current === started) setTurns((all) => all.map((t) => (t.id === id ? turn : t)))
    }
    update({ id, question, lang, state: "loading" })
    try {
      conversationId.current ??= api.startConversation(docId).then((c) => c.id)
      const answer = await api.ask(await conversationId.current, question, lang)
      update({ id, question, lang, state: "done", answer })
    } catch (error) {
      if (generation.current === started) conversationId.current = null // a failed start must not stick
      update({ id, question, lang, state: "error", error: error instanceof Error ? error.message : "Something went wrong. Retry." })
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
