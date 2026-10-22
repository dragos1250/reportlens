import { useCallback, useEffect, useState } from "react"

import { api } from "../api/client"
import type { DocumentInfo } from "../api/types"
import { Brand } from "../components/BrandMark"
import { PageStack } from "./PageStack"

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; documents: DocumentInfo[] }

/** First screen: choose one of the documents already indexed (upload comes later). */
export function DocumentPicker({ onOpen }: { onOpen: (document: DocumentInfo) => void }) {
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const [attempt, setAttempt] = useState(0) // Retry bumps it, which reruns the effect

  useEffect(() => {
    // The effect itself stays synchronous (it may only return a cleanup function); the
    // async work runs in an inner function, and `cancelled` stops it from setting state
    // after the picker is gone or a newer attempt started.
    let cancelled = false
    async function fetchDocuments() {
      try {
        const documents = await api.documents()
        if (!cancelled) setLoad({ state: "ready", documents })
      } catch (error) {
        if (!cancelled) setLoad({ state: "error", message: error instanceof Error ? error.message : "Could not load reports." })
      }
    }
    fetchDocuments()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setLoad({ state: "loading" })
    setAttempt((n) => n + 1)
  }, [])

  return (
    <main className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_68%_42%,rgb(86_109_132/0.12),transparent_31%)]">
      <header className="absolute top-6 left-5 z-10 md:top-8 md:left-10">
        <Brand />
      </header>

      <div className="mx-auto grid min-h-svh w-[min(1180px,calc(100%-40px))] items-center gap-0 py-24 md:grid-cols-2 md:gap-20">
        <PageStack className="mx-auto scale-[0.6] md:scale-100" />

        <div className="z-10 max-w-[520px] text-center md:text-left">
          <p className="mb-5 text-xs font-semibold tracking-[0.13em] text-secondary uppercase">
            Read the source, not a summary
          </p>
          <h1 className="m-0 text-4xl leading-[1.04] font-medium tracking-[-0.05em] md:text-6xl">
            See what the report actually says.
          </h1>
          <p className="mt-6 mb-8 text-base leading-relaxed text-secondary md:text-lg">
            Ask questions. Get answers grounded in the document, with the exact page every time.
          </p>

          <section aria-labelledby="documents-heading">
            <h2 id="documents-heading" className="mb-3 text-sm font-semibold text-text">
              Choose a report
            </h2>
            <DocumentList load={load} onOpen={onOpen} onRetry={retry} />
          </section>

          <p className="mt-6 text-xs text-secondary">
            Uploading your own PDF is coming later. Answers send only the question and a few passages to
            the language model.
          </p>
        </div>
      </div>
    </main>
  )
}

function DocumentList({ load, onOpen, onRetry }: {
  load: Load
  onOpen: (document: DocumentInfo) => void
  onRetry: () => void
}) {
  if (load.state === "loading") {
    return <p className="text-sm text-secondary">Loading documents…</p>
  }
  if (load.state === "error") {
    return (
      <div role="alert" className="rounded-xl border border-line-strong p-4 text-sm">
        <p className="m-0 mb-3 text-text">{load.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-lg border border-line-strong px-4 font-semibold text-text hover:border-accent"
        >
          Retry
        </button>
      </div>
    )
  }
  if (load.documents.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-secondary">
        No report is indexed yet. Run the ingestion, build the index and load it into the database (see the
        README).
      </p>
    )
  }
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {load.documents.map((document) => (
        <li key={document.docId}>
          <button
            type="button"
            onClick={() => onOpen(document)}
            className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-dashed border-line-strong bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-accent"
          >
            <span>
              <span className="block text-sm font-semibold text-text">{document.title}</span>
              <span className="block text-xs text-secondary tabular-nums">
                {document.chunks.toLocaleString("en")} passages indexed
              </span>
            </span>
            <span aria-hidden="true" className="text-secondary group-hover:text-accent">→</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
