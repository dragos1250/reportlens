import { useCallback, useEffect, useRef, useState } from "react"

import { api } from "../api/client"
import type { Lang, Message, Selection } from "../api/types"

/**
 * One question and what happened to it. A Select & explain turn has a selection, and a
 * question only for "Ask about this" ("Explain this" has none).
 */
interface TurnBase {
  id: number
  question: string | null
  selection: Selection | null
  lang: Lang
}

export type Turn =
  | (TurnBase & { state: "loading" })
  | (TurnBase & { state: "done"; answer: Message })
  | (TurnBase & { state: "error"; error: string })

/**
 * Conversation with the backend for one document, or two when comparing. The conversation
 * is created on the first question, so opening a report and leaving does not leave empty
 * conversations. Choosing another report to compare with starts a new one.
 */
export function useConversation(docId: string, compareDocId: string | null = null) {
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
  }, [docId, compareDocId])

  const run = useCallback(async (base: TurnBase) => {
    const started = generation.current
    const update = (turn: Turn) => {
      if (generation.current === started) setTurns((all) => all.map((t) => (t.id === base.id ? turn : t)))
    }
    update({ ...base, state: "loading" })
    try {
      conversationId.current ??= api.startConversation(docId, compareDocId).then((c) => c.id)
      const answer = await api.ask(await conversationId.current, base.question, base.lang, base.selection)
      update({ ...base, state: "done", answer })
    } catch (error) {
      if (generation.current === started) conversationId.current = null // a failed start must not stick
      update({ ...base, state: "error", error: error instanceof Error ? error.message : "Something went wrong. Retry." })
    }
  }, [docId, compareDocId])

  const ask = useCallback((question: string | null, lang: Lang, selection: Selection | null = null) => {
    const base: TurnBase = { id: nextId.current++, question, selection, lang }
    setTurns((all) => [...all, { ...base, state: "loading" }])
    return run(base)
  }, [run])

  const retry = useCallback(
    (turn: Turn) => run({ id: turn.id, question: turn.question, selection: turn.selection, lang: turn.lang }),
    [run],
  )

  const busy = turns.some((t) => t.state === "loading")
  return { turns, ask, retry, busy }
}
