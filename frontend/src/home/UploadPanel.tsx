import { type ChangeEvent, type DragEvent, useRef, useState } from "react"

import { api } from "../api/client"
import type { UploadAccepted } from "../api/types"

/**
 * "Upload a report" with a drop zone and the privacy note. The checks here (size, PDF) only
 * spare a pointless upload; the server checks the real file again and has the last word.
 */
export function UploadPanel({ maxMb, onUploaded }: { maxMb: number; onUploaded: (upload: UploadAccepted) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function send(file: File | undefined) {
    if (!file) return
    setProblem(null)
    if (!(file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      setProblem("Choose a PDF file.")
      return
    }
    if (file.size > maxMb * 1024 * 1024) {
      setProblem(`The file is larger than ${maxMb} MB.`)
      return
    }
    setBusy(true)
    try {
      onUploaded(await api.upload(file))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The upload failed. Retry.")
    } finally {
      setBusy(false)
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    void send(event.target.files?.[0])
    event.target.value = "" // choosing the same file again still triggers a change
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    void send(event.dataTransfer.files[0])
  }

  return (
    <section aria-labelledby="upload-heading" className="mb-8">
      <h2 id="upload-heading" className="sr-only">Upload a report</h2>
      <div
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-4 transition-colors ${dragging ? "border-accent bg-accent/[0.04]" : "border-line-strong"}`}
      >
        <button type="button" disabled={busy} onClick={() => input.current?.click()}
                className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-accent-ink disabled:opacity-60">
          {busy ? "Uploading…" : "Upload a report"}
        </button>
        <span className="ml-3 text-sm text-secondary max-sm:mt-2 max-sm:ml-0 max-sm:block">or drop a PDF here</span>
        <input ref={input} type="file" accept="application/pdf,.pdf" onChange={onPick} className="sr-only"
               aria-label="PDF report to upload" tabIndex={-1} />
        <p className="m-0 mt-3 text-xs leading-relaxed text-secondary">
          PDF with a text layer, up to {maxMb} MB. Uploaded reports are not listed: anyone with the link can open
          one, so do not upload confidential documents. They are deleted after 24 hours, or when you delete them.
        </p>
      </div>
      {problem && <p role="alert" className="m-0 mt-2 text-sm text-text">{problem}</p>}
    </section>
  )
}
