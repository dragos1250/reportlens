import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextContent } from "react-pdf/dist/shared/types.js"

import { api } from "../api/client"
import type { DocumentInfo, Lang, Passage, Selection } from "../api/types"
import { AssistantPanel } from "../chat/AssistantPanel"
import { useConversation } from "../chat/useConversation"
import { BrandMark } from "../components/BrandMark"
import { ErrorBoundary } from "../components/ErrorBoundary"
import { Icon } from "../components/Icon"
import { forgetUpload, readUploads } from "../lib/myUploads"
import { shortName } from "../lib/reports"
import { readFlag, writeFlag } from "../lib/storage"
import { findPassage, type Match, renderItem, type TextItemLike } from "../pdf/highlight"
import { PageRail } from "../pdf/PageRail"
import { PdfViewer } from "../pdf/PdfViewer"
import { SearchPanel } from "../pdf/SearchPanel"
import { SelectionToolbar } from "../pdf/SelectionToolbar"
import { marksForHit, type PdfDocumentLike, type SearchHit, searchPage, textSourceFor } from "../pdf/textSearch"
import { useTextSearch } from "../pdf/useTextSearch"
import { clampPage, ViewerToolbar } from "../pdf/ViewerToolbar"
import { UploadNotice } from "./UploadNotice"

const NIGHT_KEY = "reportlens.night-reading"

type Tab = "report" | "assistant"

/**
 * What is highlighted: a cited passage, a text search result, or a quoted selection. Each
 * belongs to one report, and is marked only while that report is shown.
 */
type Target =
  | { kind: "passage"; passage: Passage }
  | { kind: "search"; hit: SearchHit; docId: string }
  | { kind: "selection"; selection: Selection; docId: string }

function targetPage(target: Target): number {
  if (target.kind === "passage") return target.passage.page
  if (target.kind === "search") return target.hit.page
  return target.selection.page
}

const targetDoc = (target: Target) => (target.kind === "passage" ? target.passage.docId : target.docId)

/** Where a quoted selection sits on its page: the exact text first, then the passage matcher. */
function findSelection(items: TextItemLike[], selection: Selection): Match {
  const hit = searchPage(selection.page, items, selection.text)[0]
  if (hit) return { method: "exact", marks: marksForHit(items, hit) }
  return findPassage(items, selection.text)
}

/**
 * The other reports that can be compared with this one: the built-in ones and the ones
 * uploaded from this browser that are still on the server. Empty if nothing can be loaded.
 */
function useOtherReports(docId: string): DocumentInfo[] {
  const [others, setOthers] = useState<DocumentInfo[]>([])
  useEffect(() => {
    let cancelled = false
    async function load() {
      let all: DocumentInfo[] = []
      try {
        all = await api.documents()
      } catch {
        // Comparing is optional: without the list, the control is simply not offered.
      }
      for (const upload of readUploads()) {
        try {
          all.push(await api.document(upload.docId))
        } catch {
          // expired or deleted: not offered
        }
      }
      if (!cancelled) setOthers(all.filter((d) => d.docId !== docId))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [docId])
  return others
}

export function Workspace({ document, onClose }: { document: DocumentInfo; onClose: () => void }) {
  const [compareWith, setCompareWith] = useState<DocumentInfo | null>(null)
  const [viewed, setViewed] = useState<DocumentInfo>(document) // the report shown in the viewer
  const [pageByDoc, setPageByDoc] = useState<Record<string, number>>({}) // each report keeps its place
  const page = pageByDoc[viewed.docId] ?? 1
  const [pages, setPages] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [night, setNight] = useState(() => readFlag(NIGHT_KEY, false))
  const [target, setTarget] = useState<Target | null>(null)
  const [pdf, setPdf] = useState<PdfDocumentLike | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchHint, setSearchHint] = useState<string | null>(null)
  const textSource = useMemo(() => (pdf ? textSourceFor(pdf) : null), [pdf])
  const textSearch = useTextSearch(textSource)
  const [tab, setTab] = useState<Tab>("report") // phones show one pane at a time
  const others = useOtherReports(document.docId)
  const conversation = useConversation(document.docId, compareWith?.docId ?? null)
  const [pageText, setPageText] = useState<{ docId: string; page: number; items: TextItemLike[] } | null>(null)
  // Lives here, not in the panel: "Explain this" starts from the viewer and uses the same language.
  const [lang, setLang] = useState<Lang>("auto")
  const [pendingSelection, setPendingSelection] = useState<Selection | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const comparing = compareWith ? [document, compareWith] : null

  // The target's place on the shown page, recomputed when the page text or the target
  // changes. No match: nothing is marked, the jump still happened.
  const match = useMemo((): Match | null => {
    if (!target || targetDoc(target) !== viewed.docId || targetPage(target) !== page) return null
    if (pageText?.docId !== viewed.docId || pageText.page !== page) return null
    if (target.kind === "passage") return findPassage(pageText.items, target.passage.text)
    if (target.kind === "selection") return findSelection(pageText.items, target.selection)
    const marks = marksForHit(pageText.items, target.hit)
    return { method: marks.size > 0 ? "exact" : "none", marks }
  }, [target, viewed, page, pageText])

  const onGetText = useCallback((content: TextContent) => {
    // itemIndex in the text renderer counts every item, so keep the list as it is.
    setPageText({ docId: viewed.docId, page, items: content.items.map((item) => ("str" in item ? item : { str: "" })) })
  }, [viewed, page])

  const renderText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) => renderItem(str, match?.marks.get(itemIndex)),
    [match],
  )

  const notice = match?.method !== "none" ? null
    : target?.kind === "search"
      ? `Couldn’t mark the match on page ${page}.`
      : target?.kind === "selection"
        ? `Couldn’t mark the selection on page ${page}.`
        : `Couldn’t mark the passage on page ${page}; its text is in Sources.`

  const citedPages = conversation.turns.flatMap((turn) =>
    turn.state === "done"
      ? turn.answer.passages.filter((p) => p.cited && p.docId === viewed.docId).map((p) => p.page)
      : [],
  )

  function setPage(docId: string, next: number) {
    setPageByDoc((all) => ({ ...all, [docId]: next }))
  }

  function goTo(next: number) {
    setPage(viewed.docId, clampPage(next, pages ?? 1))
  }

  function onLoaded(count: number) {
    setPages(count)
    setPage(viewed.docId, clampPage(page, count))
  }

  /** Show another report in the viewer; what belongs to the old one (pages, text, search) is dropped. */
  function show(report: DocumentInfo) {
    if (report.docId === viewed.docId) return
    closeSearch()
    setPages(null)
    setPdf(null)
    setPageText(null)
    setViewed(report)
  }

  /** Jump to a page of a report, switching the viewer to it if needed. */
  function jump(docId: string, next: number) {
    const report = comparing?.find((r) => r.docId === docId)
    if (report && report.docId !== viewed.docId) {
      show(report)
      setPage(docId, next) // clamped once the report has loaded
    } else {
      goTo(next)
    }
    setTab("report")
  }

  /** A citation was clicked: always jump to its page, and remember the passage to mark. */
  function showPassage(passage: Passage) {
    setTarget({ kind: "passage", passage })
    jump(passage.docId, passage.page)
  }

  function showSelection(selection: Selection) {
    const docId = selection.docId ?? document.docId
    setTarget({ kind: "selection", selection, docId })
    jump(docId, selection.page)
  }

  /** "Explain this": ask at once, with no question; the answer uses only the selected text. */
  function explainSelection(selection: Selection) {
    void conversation.ask(null, lang, { ...selection, docId: viewed.docId })
    setTab("assistant")
  }

  /** "Ask about this": keep the selection in the composer until the reader writes a question. */
  function askAboutSelection(selection: Selection) {
    setPendingSelection({ ...selection, docId: viewed.docId })
    setTab("assistant")
  }

  function showHit(hit: SearchHit) {
    setTarget({ kind: "search", hit, docId: viewed.docId })
    goTo(hit.page)
  }

  function openSearch(hint: string | null) {
    setSearchHint(hint)
    setSearchOpen(true)
    setTab("report")
  }

  function closeSearch() {
    textSearch.cancel()
    setSearchOpen(false)
    setSearchHint(null)
  }

  /** Comparing starts a new conversation: the questions so far were about one report. */
  function chooseComparison(docId: string) {
    const next = others.find((d) => d.docId === docId) ?? null
    setCompareWith(next)
    setPendingSelection(null)
    setTarget(null)
    if (!next) show(document)
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
        <h1 className={`m-0 min-w-0 flex-1 truncate text-sm font-normal text-text ${comparing ? "max-lg:sr-only" : ""}`}>
          {viewed.title}
        </h1>
        {comparing && (
          <div role="group" aria-label="Report shown" className="flex shrink-0 rounded-lg border border-line p-0.5 max-lg:flex-1">
            {comparing.map((report) => (
              <button
                key={report.docId}
                type="button"
                aria-pressed={report.docId === viewed.docId}
                onClick={() => show(report)}
                className="min-h-10 flex-1 truncate rounded-md px-3 text-xs text-secondary aria-pressed:bg-line aria-pressed:text-text md:min-h-8"
              >
                {shortName(report)}
              </button>
            ))}
          </div>
        )}
        {others.length > 0 && (
          <label className="flex shrink-0 items-center gap-2 text-xs text-secondary">
            <span className="max-md:sr-only">Compare with</span>
            <select
              value={compareWith?.docId ?? ""}
              onChange={(event) => chooseComparison(event.target.value)}
              aria-label="Compare with"
              className="min-h-11 max-w-40 rounded-lg border border-line bg-app-deep px-2 text-xs text-text md:min-h-9"
            >
              <option value="">No comparison</option>
              {others.map((d) => <option key={d.docId} value={d.docId}>{shortName(d)}</option>)}
            </select>
          </label>
        )}
        {pages !== null && (
          <span className="shrink-0 border-l border-line-strong pl-3 text-xs text-secondary tabular-nums max-md:hidden">
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
          <div className="grid min-h-0 min-w-0 grid-rows-[48px_auto_1fr] bg-viewer">
            <ViewerToolbar page={page} pages={pages} zoom={zoom} onPage={goTo} onZoom={setZoom}
                           searchOpen={searchOpen} onToggleSearch={() => (searchOpen ? closeSearch() : openSearch(null))} />
            <div>
              {viewed.source === "upload" && (
                <UploadNotice document={viewed} onDeleted={() => {
                  forgetUpload(viewed.docId)
                  onClose()
                }} />
              )}
              {searchOpen && (
                <SearchPanel state={textSearch.state} hint={searchHint}
                             activeHit={target?.kind === "search" ? target.hit : null}
                             onSearch={textSearch.search} onPick={showHit} onClose={closeSearch} />
              )}
            </div>
            <div ref={viewerRef} className="relative grid min-h-0 min-w-0">
              {/* A new key per report: the viewer starts clean instead of mixing two documents. */}
              <PdfViewer key={`viewer-${viewed.docId}`} fileUrl={api.pdfUrl(viewed.docId)} page={page} zoom={zoom} night={night}
                         onLoaded={onLoaded} onDocument={setPdf} customTextRenderer={renderText}
                         onGetTextSuccess={onGetText} notice={notice} />
              <SelectionToolbar key={`toolbar-${viewed.docId}`} containerRef={viewerRef} page={page} onExplain={explainSelection}
                                onAsk={askAboutSelection} />
            </div>
          </div>
        </section>
        <div id="pane-assistant" className={`min-h-0 md:grid ${tab === "assistant" ? "grid" : "hidden"}`}>
          {/* A failure in the panel must not take the PDF down with it; the conversation
              lives in this component, so reloading the panel keeps it. */}
          <ErrorBoundary name="The assistant" onReload={() => setTarget(null)} className="border-l border-line">
            <AssistantPanel
              turns={conversation.turns}
              busy={conversation.busy}
              activeChunkId={target?.kind === "passage" ? target.passage.chunkId : null}
              lang={lang}
              onLang={setLang}
              pendingSelection={pendingSelection}
              onClearSelection={() => setPendingSelection(null)}
              onAsk={conversation.ask}
              onRetry={conversation.retry}
              onCite={showPassage}
              onShowSelection={showSelection}
              onSearchReport={openSearch}
              comparing={comparing}
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
