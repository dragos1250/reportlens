import { useState } from "react"

import { api } from "../api/client"
import type { DocumentInfo } from "../api/types"
import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { readFlag, writeFlag } from "../lib/storage"
import { PdfViewer } from "../pdf/PdfViewer"
import { clampPage, ViewerToolbar } from "../pdf/ViewerToolbar"

const NIGHT_KEY = "reportlens.night-reading"

export function Workspace({ document, onClose }: { document: DocumentInfo; onClose: () => void }) {
  const [pages, setPages] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [night, setNight] = useState(() => readFlag(NIGHT_KEY, false))

  function toggleNight() {
    setNight((value) => {
      writeFlag(NIGHT_KEY, !value)
      return !value
    })
  }

  return (
    <div className="grid h-svh grid-rows-[56px_1fr] overflow-hidden md:grid-rows-[64px_1fr]">
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
          <span aria-hidden="true" className="relative h-3.5 w-6 rounded-full bg-[#283747]">
            <span className={`absolute top-[3px] size-2 rounded-full transition-[left] ${night ? "left-[13px] bg-accent" : "left-[3px] bg-secondary"}`} />
          </span>
        </button>
      </header>

      <section aria-label="Report" className="grid min-h-0 grid-rows-[48px_1fr] bg-viewer">
        <ViewerToolbar page={page} pages={pages} zoom={zoom}
                       onPage={(next) => setPage(clampPage(next, pages ?? 1))} onZoom={setZoom} />
        <PdfViewer fileUrl={api.pdfUrl(document.docId)} page={page} zoom={zoom} night={night} onLoaded={setPages} />
      </section>
    </div>
  )
}
