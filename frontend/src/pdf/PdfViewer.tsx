import "react-pdf/dist/Page/TextLayer.css"

import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import type { CustomTextRenderer, OnGetTextSuccess } from "react-pdf/dist/shared/types.js"

// pdf.js parses the file in a web worker, served by Vite from the installed package.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

// Load the 32 MB report in parts: the backend answers range requests. Both flags are needed:
// with streaming on, pdf.js still downloads the whole file in the background. Measured on
// the 588-page report through Spring: opening it and reading page 12 read 0.59 MB with
// these options, 32.19 MB with streaming on.
// Defined once: react-pdf reloads the document when this object changes.
const PDF_OPTIONS = { disableAutoFetch: true, disableStream: true, rangeChunkSize: 1 << 16 }

interface Props {
  fileUrl: string
  page: number
  zoom: number // 1 = page fits the available width
  night: boolean
  onLoaded: (pages: number) => void
  customTextRenderer?: CustomTextRenderer
  onGetTextSuccess?: OnGetTextSuccess
  notice?: string | null // shown above the page, e.g. when a passage could not be marked
}

/** Measures the stage so that zoom 100% means "fit width". */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(700)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function PdfViewer({ fileUrl, page, zoom, night, onLoaded, customTextRenderer, onGetTextSuccess, notice }: Props) {
  const [stageRef, stageWidth] = useWidth<HTMLDivElement>()
  const pageWidth = Math.max(240, Math.min(stageWidth - 32, 900)) * zoom

  /** Bring the first highlighted line into view once the text layer is drawn. */
  function revealHighlight() {
    stageRef.current?.querySelector("mark.rl-mark")?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  return (
    <div ref={stageRef} className="min-h-0 overflow-auto px-4 pt-6 pb-16 md:px-12 md:pt-9">
      <p aria-live="polite" className={notice ? "mx-auto mb-4 max-w-[600px] rounded-lg border border-line-strong bg-panel px-3 py-2 text-center text-xs text-secondary" : "sr-only"}>
        {notice ?? ""}
      </p>
      <Document
        file={fileUrl}
        options={PDF_OPTIONS}
        onLoadSuccess={({ numPages }) => onLoaded(numPages)}
        loading={<p className="text-center text-sm text-secondary">Opening the report…</p>}
        error={
          <p role="alert" className="text-center text-sm text-text">
            The report could not be opened. Check that the backend and the AI service are running, then reload.
          </p>
        }
      >
        {/* Paper tone: the white canvas is multiplied onto a warm background; night
            reading darkens the whole page. */}
        <div
          className={`relative mx-auto w-fit bg-paper shadow-[0_18px_50px_rgb(0_0_0/0.36)] transition-[filter] duration-200 [&_canvas]:mix-blend-multiply ${
            night ? "brightness-[0.76] sepia-[0.08]" : ""
          }`}
        >
          <Page
            pageNumber={page}
            width={pageWidth}
            renderAnnotationLayer={false}
            customTextRenderer={customTextRenderer}
            onGetTextSuccess={onGetTextSuccess}
            onRenderTextLayerSuccess={revealHighlight}
            loading={<div style={{ width: pageWidth, height: pageWidth * 1.29 }} />}
          />
        </div>
      </Document>
    </div>
  )
}
