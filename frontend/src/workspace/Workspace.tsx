import { useCallback, useMemo, useState } from "react"
import type { TextContent } from "react-pdf/dist/shared/types.js"

import { api } from "../api/client"
import type { DocumentInfo, Passage } from "../api/types"
import { AssistantPanel } from "../chat/AssistantPanel"
import { useConversation } from "../chat/useConversation"
import { BrandMark } from "../components/BrandMark"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { Icon } from "../components/Icon"
import { readFlag, writeFlag } from "../lib/storage"
import { findPassage, renderItem, type TextItemLike } from "../pdf/highlight"
import { PageRail } from "../pdf/PageRail"
import { PdfViewer } from "../pdf/PdfViewer"
import { clampPage, ViewerToolbar } from "../pdf/ViewerToolbar"

const NIGHT_KEY = "reportlens.night-reading"

type Tab = "report" | "assistant"

export function Workspace({ document, onClose }: { document: DocumentInfo; onClose: () => void }) {
  const [pages, setPages] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [night, setNight] = useState(() => readFlag(NIGHT_KEY, false))
  const [active, setActive] = useState<Passage | null>(null)
  const [tab, setTab] = useState<Tab>("report") // phones show one pane at a time
  const conversation = useConversation(document.docId)
  const [pageText, setPageText] = useState<{ page: number; items: TextItemLike[] } | null>(null)

  // The cited passage's place on the shown page, recomputed when the page text or the
  // passage changes. No match: nothing is marked, the jump still happened.
  const match = useMemo(() => {
    if (!active || active.page !== page || pageText?.page !== page) return null
    return findPassage(pageText.items, active.text)
  }, [active, page, pageText])

  const onGetText = useCallback((content: TextContent) => {
    // itemIndex in the text renderer counts every item, so keep the list as it is.
    setPageText({ page, items: content.items.map((item) => ("str" in item ? item : { str: "" })) })
  }, [page])

  const renderText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) => renderItem(str, match?.marks.get(itemIndex)),
    [match],
  )

  const notice = match?.method === "none"
    ? `Couldn’t mark the passage on page ${page}; its text is in Sources.`
    : null

  const citedPages = conversation.turns.flatMap((turn) =>
    turn.state === "done" ? turn.answer.passages.filter((p) => p.cited).map((p) => p.page) : [],
  )

  function goTo(next: number) {
    setPage(clampPage(next, pages ?? 1))
  }

  /** A citation was clicked: always jump to its page, and remember the passage to mark. */
  function showPassage(passage: Passage) {
    setActive(passage)
    goTo(passage.page)
    setTab("report")
  }

  function toggleNight() {
    const next = !night
    setNight(next)
    writeFlag(NIGHT_KEY, next)
  }

  return (
    <div className="grid h-svh grid-rows-[56px_1fr_58px] overflow-hidden md:grid-rows-[64px_1fr]">
      <header className="flex items-center gap-3 border-b border-line bg-app-deep pr-2 md:pr-4">
        <button type="button" onClick={onClose} aria-label="Back to reports"
                className="flex h-full items-center gap-2 border-r border-line px-3 text-sm font-semibold md:px-6">
          <BrandMark />
          <span className="max-md:sr-only">ReportLens</span>
        </button>
        <h1 className="m-0 min-w-0 flex-1 truncate text-sm font-normal text-text">{document.title}</h1>
        {pages !== null && (
          <span className="shrink-0 border-l border-line-strong pl-3 text-xs text-secondary tabular-nums">
            {pages} pages
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={night}
          onClick={toggleNight}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-xs text-secondary aria-checked:border-line-strong aria-checked:text-text md:min-h-9"
        >
          <Icon name="moon" size={16} />
          <span className="max-md:sr-only">Night reading</span>
          <span aria-hidden="true" className="relative h-3.5 w-6 rounded-full bg-switch-track">
            <span className={`absolute top-[3px] size-2 rounded-full transition-[left] ${night ? "left-[13px] bg-accent" : "left-[3px] bg-secondary"}`} />
          </span>
        </button>
      </header>

      <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_440px]">
        <section id="pane-report" aria-label="Report"
                 className={`min-h-0 grid-cols-[28px_1fr] md:grid md:grid-cols-[42px_1fr] ${tab === "report" ? "grid" : "hidden"}`}>
          <PageRail pages={pages} current={page} cited={citedPages} onPage={goTo} />
          <div className="grid min-h-0 min-w-0 grid-rows-[48px_1fr] bg-viewer">
            <ViewerToolbar page={page} pages={pages} zoom={zoom} onPage={goTo} onZoom={setZoom} />
            <PdfViewer fileUrl={api.pdfUrl(document.docId)} page={page} zoom={zoom} night={night} onLoaded={setPages}
                       customTextRenderer={renderText} onGetTextSuccess={onGetText} notice={notice} />
          </div>
        </section>
        <div id="pane-assistant" className={`min-h-0 md:grid ${tab === "assistant" ? "grid" : "hidden"}`}>
          {/* A failure in the panel must not take the PDF down with it; the conversation
              lives in this component, so reloading the panel keeps it. */}
          <ErrorBoundary name="The assistant" onReload={() => setActive(null)} className="border-l border-line">
            <AssistantPanel
              turns={conversation.turns}
              busy={conversation.busy}
              activeChunkId={active?.chunkId ?? null}
              onAsk={conversation.ask}
              onRetry={conversation.retry}
              onCite={showPassage}
            />
          </ErrorBoundary>
        </div>
      </div>

      <div role="tablist" aria-label="Workspace" className="grid grid-cols-2 border-t border-line bg-app-deep md:hidden">
        {(["report", "assistant"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            aria-controls={`pane-${name}`}
            onClick={() => setTab(name)}
            className="relative min-h-11 text-sm text-secondary aria-selected:text-text aria-selected:before:absolute aria-selected:before:inset-x-[28%] aria-selected:before:-top-px aria-selected:before:h-0.5 aria-selected:before:bg-accent"
          >
            {name === "report" ? "Report" : "Assistant"}
          </button>
        ))}
      </div>
    </div>
  )
}
