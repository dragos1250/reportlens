import { type FormEvent, useEffect, useRef, useState } from "react"

import { Icon } from "../components/Icon"
import { iconButton } from "./ViewerToolbar"
import type { SearchHit } from "./textSearch"
import type { SearchState } from "./useTextSearch"

export const MAX_SHOWN = 100

interface Props {
  state: SearchState
  /** The question that led here ("Search the report text" after a refusal), shown as a hint. */
  hint: string | null
  activeHit: SearchHit | null
  onSearch: (query: string) => void
  onPick: (hit: SearchHit) => void
  onClose: () => void
}

const sameHit = (a: SearchHit | null, b: SearchHit) => a !== null && a.page === b.page && a.start === b.start

/** Exact text search in the report, without AI: results are pages with a short context. */
export function SearchPanel({ state, hint, activeHit, onSearch, onPick, onClose }: Props) {
  const [query, setQuery] = useState("") // never prefilled: the user picks the words
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [hint])

  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch(query)
  }

  return (
    <section aria-label="Search the report text" className="border-b border-line bg-panel-soft px-3 py-3 md:px-4">
      <form onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor="report-search" className="sr-only">Search the report text</label>
        <input
          id="report-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Exact words or figures, e.g. €7.6 billion"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-composer px-3 text-sm text-text placeholder:text-secondary md:h-9"
        />
        <button type="submit" className="flex min-h-11 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-bold text-accent-ink md:min-h-9">
          <Icon name="search" size={15} /> Search
        </button>
        <button type="button" aria-label="Close search" onClick={onClose} className={iconButton}>
          <span aria-hidden="true" className="text-lg leading-none">×</span>
        </button>
      </form>

      {hint && (
        <p className="m-0 mt-2 text-xs text-secondary">
          Your question: <span className="text-text">“{hint}”</span>. Type the exact words to look for.
        </p>
      )}

      <div aria-live="polite" className="mt-2">
        <Status state={state} onRetry={() => state.status === "error" && onSearch(state.query)} />
      </div>

      {(state.status === "searching" || state.status === "done") && state.hits.length > 0 && (
        <ol className="m-0 mt-2 max-h-[40vh] list-none overflow-y-auto p-0">
          {state.hits.slice(0, MAX_SHOWN).map((hit) => (
            <li key={`${hit.page}:${hit.start}`}>
              <button
                type="button"
                onClick={() => onPick(hit)}
                aria-current={sameHit(activeHit, hit) ? "true" : undefined}
                className={`grid min-h-11 w-full grid-cols-[52px_1fr] items-baseline gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-white/[0.03] ${
                  sameHit(activeHit, hit) ? "border-accent/25 bg-accent/[0.035]" : "border-transparent"
                }`}
              >
                <span className="text-sm text-accent tabular-nums">p. {hit.page}</span>
                {/* React escapes these strings: page text can never become HTML here. */}
                <span className="line-clamp-2 font-reading text-[13px] leading-snug text-secondary">
                  …{hit.before}
                  <mark className="rounded-sm bg-accent/30 px-0.5 text-text">{hit.match}</mark>
                  {hit.after}…
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Status({ state, onRetry }: { state: SearchState; onRetry: () => void }) {
  if (state.status === "idle") {
    return <p className="m-0 text-xs text-secondary">Exact match, not case-sensitive, no AI. Press Enter to search.</p>
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="m-0 flex items-center gap-3 text-xs text-text">
        {state.message}
        <button type="button" onClick={onRetry} className="min-h-11 rounded-md border border-line-strong px-3 font-semibold md:min-h-8">
          Retry
        </button>
      </p>
    )
  }
  const pages = new Set(state.hits.map((h) => h.page)).size
  const count = `${state.hits.length} ${state.hits.length === 1 ? "match" : "matches"} on ${pages} ${pages === 1 ? "page" : "pages"}`
  const scanned = state.pagesWithoutText === 0 ? ""
    : state.pagesWithoutText === 1
      ? " 1 page has no text layer (scanned) and cannot be searched."
      : ` ${state.pagesWithoutText} pages have no text layer (scanned) and cannot be searched.`
  if (state.status === "searching") {
    return <p className="m-0 text-xs text-secondary tabular-nums">Searching page {state.searched} of {state.total}… {count} so far.</p>
  }
  if (state.hits.length === 0) {
    return <p className="m-0 text-xs text-secondary">No matches for “{state.query}” in the text of this report.{scanned}</p>
  }
  return (
    <p className="m-0 text-xs text-secondary tabular-nums">
      {count}{state.hits.length > MAX_SHOWN ? `, showing the first ${MAX_SHOWN}` : ""}.{scanned}
    </p>
  )
}
