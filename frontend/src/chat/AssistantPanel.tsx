import { useEffect, useRef, useState } from "react"

import type { Lang, Passage } from "../api/types"
import { Icon } from "../components/Icon"
import { AnswerText, Sources } from "./Answer"
import { Composer } from "./Composer"
import { NotInReport } from "./NotInReport"
import type { Turn } from "./useConversation"

interface Props {
  turns: Turn[]
  busy: boolean
  activeChunkId: string | null
  onAsk: (question: string, lang: Lang) => void
  onRetry: (turn: Turn) => void
  onCite: (passage: Passage) => void
  /** "Search the report text" after a refusal; the question is passed as a hint only. */
  onSearchReport: (question: string) => void
}

export function AssistantPanel({ turns, busy, activeChunkId, onAsk, onRetry, onCite, onSearchReport }: Props) {
  const [draft, setDraft] = useState("")
  const [lang, setLang] = useState<Lang>("auto")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Braces on purpose: an effect may only return a cleanup function. Browsers now return a
  // Promise from scrollIntoView, and returning it here crashed the panel.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" })
  }, [turns])

  function submit() {
    onAsk(draft.trim(), lang)
    setDraft("")
  }

  function rephrase(question: string) {
    setDraft(question)
    textareaRef.current?.focus()
  }

  const lastDone = [...turns].reverse().find((t) => t.state === "done")

  return (
    <aside aria-label="Report assistant" className="grid min-h-0 min-w-0 grid-rows-[48px_1fr_auto] border-l border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-4 text-sm font-semibold">
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md border border-accent/25 bg-accent/5 text-accent">
            <Icon name="spark" size={15} />
          </span>
          Report assistant
        </span>
        <span className="flex items-center gap-1.5 text-xs font-medium text-secondary">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-teal" />
          Grounded in report
        </span>
      </div>

      <div className="min-h-0 overflow-y-auto px-5 pt-5 pb-8" aria-live="polite">
        {turns.length === 0 && (
          <p className="m-0 font-reading text-[15px] leading-relaxed text-secondary">
            Ask a question about this report. Every answer points to the page it comes from; when the
            report does not say, the assistant says so.
          </p>
        )}
        {turns.map((turn) => (
          <article key={turn.id} className="mb-6 border-b border-line pb-5 last:border-b-0">
            <h2 className="m-0 mb-1 text-xs font-medium text-secondary">You asked</h2>
            <p className="m-0 mb-4 text-[15px] leading-normal font-semibold tracking-tight">{turn.question}</p>
            <TurnBody turn={turn} isLast={turn === lastDone} activeChunkId={activeChunkId}
                      onCite={onCite} onRetry={onRetry} onRephrase={() => rephrase(turn.question)}
                      onSearchReport={() => onSearchReport(turn.question)} />
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <Composer draft={draft} lang={lang} busy={busy} textareaRef={textareaRef}
                onDraft={setDraft} onLang={setLang} onSubmit={submit} />
    </aside>
  )
}

function TurnBody({ turn, isLast, activeChunkId, onCite, onRetry, onRephrase, onSearchReport }: {
  turn: Turn
  isLast: boolean
  activeChunkId: string | null
  onCite: (passage: Passage) => void
  onRetry: (turn: Turn) => void
  onRephrase: () => void
  onSearchReport: () => void
}) {
  if (turn.state === "loading") {
    return <p className="m-0 animate-pulse text-sm text-secondary">Searching the report…</p>
  }
  if (turn.state === "error") {
    return <Problem text={turn.error} onRetry={() => onRetry(turn)} />
  }

  const message = turn.answer
  if (message.status === "not_found" || message.status === "not_in_report") {
    return <NotInReport message={message} onPage={onCite} onRephrase={onRephrase} onSearchReport={onSearchReport} />
  }
  if (message.status !== "answered") {
    // incomplete or invalid_output: the answer could not be completed or checked.
    return <Problem text="The answer could not be completed. Retry, or rephrase the question." onRetry={() => onRetry(turn)} />
  }
  return (
    <>
      <h3 className="sr-only">Answer</h3>
      <AnswerText message={message} activeChunkId={activeChunkId} onCite={onCite} />
      {message.model && (
        <p className="m-0 mt-2 text-xs text-secondary">
          {message.model}
          {message.costUsd !== null && ` · $${message.costUsd.toFixed(4)}`}
        </p>
      )}
      {isLast && <Sources message={message} activeChunkId={activeChunkId} onCite={onCite} />}
    </>
  )
}

function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-line-strong p-4">
      <p className="m-0 mb-3 text-sm text-text">{text}</p>
      <button type="button" onClick={onRetry}
              className="min-h-11 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:border-accent md:min-h-9">
        Retry
      </button>
    </div>
  )
}
