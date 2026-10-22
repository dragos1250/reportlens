import { useState } from "react"

import { api } from "../api/client"
import type { DocumentInfo } from "../api/types"

/**
 * Shown above an uploaded report: what automatic indexing cannot promise, how many pages
 * could not be read, and how to delete it. The cleaning rules were calibrated on two
 * reports only, so this is said plainly instead of implied.
 */
export function UploadNotice({ document, onDeleted }: { document: DocumentInfo; onDeleted: () => void }) {
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const scanned = document.pagesWithoutText ?? 0

  async function remove() {
    try {
      await api.deleteDocument(document.docId)
      onDeleted()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not delete. Retry.")
    }
  }

  return (
    <section aria-label="About this uploaded report"
             className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel-soft px-4 py-2 text-xs text-secondary">
      <p className="m-0 flex-1 leading-relaxed">
        Indexed automatically: headers, tables and scanned pages may be handled imperfectly. Check every citation.
        {scanned > 0 && ` ${scanned} page${scanned === 1 ? " has" : "s have"} no text layer and cannot be searched.`}
        {" "}Uploaded reports are deleted after 24 hours.
      </p>
      {confirming ? (
        <span className="flex items-center gap-2">
          <span className="text-text">Delete this report and its conversations?</span>
          <button type="button" onClick={() => void remove()}
                  className="min-h-9 rounded-md border border-line-strong px-3 font-semibold text-text hover:border-accent">
            Delete
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="min-h-9 px-2 hover:text-text">
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
                className="min-h-9 rounded-md border border-line px-3 hover:border-line-strong hover:text-text">
          Delete report
        </button>
      )}
      {problem && <p role="alert" className="m-0 w-full text-text">{problem}</p>}
    </section>
  )
}
