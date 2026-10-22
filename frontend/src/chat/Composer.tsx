import type { FormEvent, KeyboardEvent, RefObject } from "react"

import type { Lang, Selection } from "../api/types"
import { Icon } from "../components/Icon"

const LANGS: { value: Lang; label: string; name: string }[] = [
  { value: "auto", label: "Auto", name: "Same as the question" },
  { value: "en", label: "EN", name: "English" },
  { value: "ro", label: "RO", name: "Romanian" },
]

interface Props {
  draft: string
  lang: Lang
  busy: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** "Ask about this": the question will be answered from this text only. */
  pendingSelection?: Selection | null
  onClearSelection?: () => void
  onDraft: (text: string) => void
  onLang: (lang: Lang) => void
  onSubmit: () => void
}

export function Composer({ draft, lang, busy, textareaRef, pendingSelection = null, onClearSelection, onDraft, onLang,
  onSubmit }: Props) {
  const canAsk = draft.trim().length > 0 && !busy

  function submit(event: FormEvent) {
    event.preventDefault()
    if (canAsk) onSubmit()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (canAsk) onSubmit()
    }
  }

  return (
    <form
      onSubmit={submit}
      className="m-3.5 mt-0 rounded-xl border border-line-strong bg-composer px-3 pt-3 pb-2 shadow-[0_-12px_30px_rgb(15_23_32/0.55)] focus-within:border-accent/40"
    >
      {pendingSelection && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-white/[0.02] px-2.5 py-2">
          <p className="m-0 line-clamp-2 flex-1 text-xs text-secondary">
            About the text on <span className="text-text tabular-nums">p. {pendingSelection.page}</span>:{" "}
            <span className="font-reading">“{pendingSelection.text}”</span>. The answer uses only this text.
          </p>
          <button type="button" onClick={onClearSelection} aria-label="Remove the selected text"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-secondary hover:bg-line hover:text-text md:size-7">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      <label htmlFor="question" className="sr-only">Ask about the report</label>
      <textarea
        id="question"
        ref={textareaRef}
        rows={2}
        maxLength={1000}
        value={draft}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={pendingSelection ? "Ask about the selected text…" : "Ask about this report…"}
        className="w-full resize-none border-0 bg-transparent text-sm leading-normal text-text placeholder:text-secondary focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="m-0 flex items-center gap-1 border-0 p-0">
          <legend className="sr-only">Answer language</legend>
          <span aria-hidden="true" className="mr-1 text-xs text-secondary">Answer in</span>
          {LANGS.map((option) => (
            <label
              key={option.value}
              title={option.name}
              className="grid min-h-11 min-w-9 cursor-pointer place-items-center rounded-md px-1.5 text-xs text-secondary has-checked:bg-line has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-accent md:min-h-8"
            >
              <input
                type="radio"
                name="lang"
                value={option.value}
                checked={lang === option.value}
                onChange={() => onLang(option.value)}
                aria-label={option.name}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <span className="text-xs text-secondary max-sm:hidden">Answers cite exact pages</span>
        <button
          type="submit"
          disabled={!canAsk}
          className="flex min-h-11 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-bold text-accent-ink disabled:opacity-50 md:min-h-9"
        >
          Ask <Icon name="send" size={15} />
        </button>
      </div>
    </form>
  )
}
