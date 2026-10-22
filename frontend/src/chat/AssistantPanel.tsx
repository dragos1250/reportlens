import { useEffect, useRef, useState } from "react"

import type { Lang, Message, Passage, Selection } from "../api/types"
import { Icon } from "../components/Icon"
import { AnswerText, Sources } from "./Answer"
import { Composer } from "./Composer"
import { NotInReport } from "./NotInReport"
import type { Turn } from "./useConversation"

interface Props {
  turns: Turn[]
  busy: boolean
  activeChunkId: string | null
  lang: Lang
  onLang: (lang: Lang) => void
  /** Text chosen with "Ask about this", waiting for the reader's question. */
  pendingSelection: Selection | null
  onClearSelection: () => void
  onAsk: (question: string, lang: Lang, selection: Selection | null) => void
  onRetry: (turn: Turn) => void
  onCite: (passage: Passage) => void
  /** Jump to a quoted selection's page and mark it. */
  onShowSelection: (selection: Selection) => void
  /** "Search the report text" after a refusal; the question is passed as a hint only. */
  onSearchReport: (question: string) => void
}

const EXPLAIN_REFUSALS = new Set(["not_enough", "too_short", "too_long", "no_text"])

export function AssistantPanel({
  turns, busy, activeChunkId, lang, onLang, pendingSelection, onClearSelection, onAsk, onRetry, onCite,
  onShowSelection, onSearchReport,
}: Props) {
  const [draft, setDraft] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Braces on purpose: an effect may only return a cleanup function. Browsers now return a
  // Promise from scrollIntoView, and returning it here crashed the panel.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" })
  }, [turns])

  useEffect(() => {
    if (pendingSelection) textareaRef.current?.focus()
  }, [pendingSelection])

  function submit() {
    onAsk(draft.trim(), lang, pendingSelection)
    setDraft("")
    onClearSelection()
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
            report does not say, the assistant says so. You can also select text in the report and choose
            “Explain this”.
          </p>
        )}
        {turns.map((turn) => (
          <article key={turn.id} className="mb-6 border-b border-line pb-5 last:border-b-0">
            {turn.selection && <SelectionQuote selection={turn.selection} onShow={onShowSelection} />}
            {turn.question && (
              <>
                <h2 className="m-0 mb-1 text-xs font-medium text-secondary">You asked</h2>
                <p className="m-0 mb-4 text-[15px] leading-normal font-semibold tracking-tight">{turn.question}</p>
              </>
            )}
            <TurnBody turn={turn} isLast={turn === lastDone} activeChunkId={activeChunkId}
                      onCite={onCite} onRetry={onRetry} onRephrase={() => rephrase(turn.question ?? "")}
                      onSearchReport={() => onSearchReport(turn.question ?? "")} />
          </article>
        ))}
        <div ref={endRef} />
      </div>

      <Composer draft={draft} lang={lang} busy={busy} textareaRef={textareaRef}
                pendingSelection={pendingSelection} onClearSelection={onClearSelection}
                onDraft={setDraft} onLang={onLang} onSubmit={submit} />
    </aside>
  )
}

/** The selected text, quoted with its page; the page jumps back to it in the report. */
function SelectionQuote({ selection, onShow }: { selection: Selection; onShow: (selection: Selection) => void }) {
  return (
    <div className="mb-4">
      <h2 className="m-0 mb-1.5 flex items-center gap-2 text-xs font-medium text-secondary">
        You selected
        <button type="button" onClick={() => onShow(selection)} aria-label={`Show the selection on page ${selection.page}`}
                className="inline-flex min-h-6 items-center rounded-[5px] border border-line-strong px-1.5 text-xs text-text tabular-nums hover:border-accent hover:text-accent max-md:min-h-8">
          p. {selection.page}
        </button>
      </h2>
      <blockquote className="m-0 line-clamp-6 border-l-2 border-accent/60 pl-3 font-reading text-[13px] leading-snug text-secondary">
        “{selection.text}”
      </blockquote>
    </div>
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
    return (
      <p className="m-0 animate-pulse text-sm text-secondary">
        {turn.selection ? "Reading the selected text…" : "Searching the report…"}
      </p>
    )
  }
  if (turn.state === "error") {
    return <Problem text={turn.error} onRetry={() => onRetry(turn)} />
  }

  const message = turn.answer
  if (message.status === "explained") return <Explanation message={message} />
  if (message.status && EXPLAIN_REFUSALS.has(message.status)) return <CannotExplain message={message} />
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
      <ModelLine message={message} />
      {isLast && <Sources message={message} activeChunkId={activeChunkId} onCite={onCite} />}
    </>
  )
}

/** An explanation of the selection: says plainly that it rests on that text only. */
function Explanation({ message }: { message: Message }) {
  return (
    <>
      <h3 className="sr-only">Explanation</h3>
      <p className="m-0 mb-2 text-xs text-secondary">Based only on this text, not the whole report.</p>
      <p className="m-0 font-reading text-base leading-relaxed text-answer">{message.content}</p>
      <ModelLine message={message} />
    </>
  )
}

/** Calm refusal for a selection: too short, too long, without text, or not enough to explain. */
function CannotExplain({ message }: { message: Message }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-4 py-4">
      <h3 className="m-0 mb-1 text-sm font-semibold">Nothing to explain from this selection</h3>
      <p className="m-0 font-reading text-[13px] leading-relaxed text-secondary">{message.content}</p>
    </div>
  )
}

function ModelLine({ message }: { message: Message }) {
  if (!message.model) return null
  return (
    <p className="m-0 mt-2 text-xs text-secondary">
      {message.model}
      {message.costUsd !== null && ` · $${message.costUsd.toFixed(4)}`}
    </p>
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
