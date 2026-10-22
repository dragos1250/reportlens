import { useEffect, useRef, useState } from "react"

import { api } from "../api/client"
import type { DocumentInfo, UploadAccepted, UploadJob } from "../api/types"
import { Brand } from "../components/BrandMark"
import { PageStack } from "./PageStack"

export const POLL_MS = 1000

/**
 * The "Processing" screen: polls the upload's job every second until it is ready (then
 * opens the workspace) or failed (then says why). Polling, not a push channel: it passes
 * through any proxy as is, and a missed answer is simply caught up by the next one.
 */
export function Processing({ upload, onReady, onBack, pollMs = POLL_MS }: {
  upload: UploadAccepted
  onReady: (document: DocumentInfo) => void
  onBack: () => void
  pollMs?: number // tests poll faster
}) {
  const [job, setJob] = useState<UploadJob | null>(null)
  const [lostContact, setLostContact] = useState(false)
  const ready = useRef(onReady)
  ready.current = onReady

  useEffect(() => {
    // Braces on purpose: an effect may only return its cleanup function.
    let cancelled = false
    let timer: number | undefined
    async function poll() {
      try {
        const current = await api.uploadJob(upload.jobId)
        if (cancelled) return
        setJob(current)
        setLostContact(false)
        if (current.state === "ready") {
          const document = await api.document(current.docId)
          if (!cancelled) ready.current(document)
          return
        }
        if (current.state === "failed") return
      } catch {
        if (cancelled) return
        setLostContact(true) // keep trying: the job goes on in the background
      }
      timer = window.setTimeout(poll, pollMs)
    }
    poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [upload.jobId, pollMs])

  const failed = job?.state === "failed"
  const percent = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : null

  return (
    <main className="relative min-h-full overflow-hidden">
      <header className="absolute top-6 left-5 z-10 md:top-8 md:left-10">
        <Brand />
      </header>
      <div className="mx-auto grid min-h-svh w-[min(1180px,calc(100%-40px))] items-center py-24 md:grid-cols-2 md:gap-20">
        <PageStack className={`mx-auto scale-[0.6] md:scale-100 ${failed ? "" : "page-stack--fanned"}`} />
        <div className="z-10 max-w-[520px]">
          <p className="mb-3 text-xs font-semibold tracking-[0.13em] text-secondary uppercase">Processing</p>
          <h1 className="m-0 mb-6 text-3xl leading-tight font-medium tracking-tight break-words">{upload.title}</h1>

          {failed ? (
            <div role="alert" className="rounded-xl border border-dashed border-line-strong p-4">
              <p className="m-0 mb-3 text-sm text-text">{job.error ?? "The file could not be processed."}</p>
              <button type="button" onClick={onBack}
                      className="min-h-11 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:border-accent">
                Choose another file
              </button>
            </div>
          ) : (
            <>
              <p className="m-0 mb-3 text-base text-text" aria-live="polite">{label(job)}</p>
              <div role="progressbar" aria-label="Processing progress" aria-valuemin={0} aria-valuemax={100}
                   aria-valuenow={percent ?? undefined}
                   className="h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full bg-accent transition-[width] ${percent === null ? "w-1/5 animate-pulse" : ""}`}
                     style={percent === null ? undefined : { width: `${percent}%` }} />
              </div>
              {job && job.total > 0 && (
                <p className="m-0 mt-2 text-xs text-secondary tabular-nums">{job.done} of {job.total}</p>
              )}
              {lostContact && (
                <p className="m-0 mt-3 text-xs text-secondary">Lost contact with the server; still trying…</p>
              )}
              <p className="m-0 mt-6 text-xs leading-relaxed text-secondary">
                Indexing runs on this server's CPU and can take a few minutes for a long report; answers to other
                questions may be slower meanwhile. You can leave this page: the upload goes on.
              </p>
              <button type="button" onClick={onBack} className="mt-4 text-sm text-secondary underline hover:text-text">
                Back to reports
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function label(job: UploadJob | null): string {
  if (job === null) return "Starting…"
  if (job.state === "queued") {
    const ahead = job.queuePosition ?? 0
    return ahead > 0 ? `Waiting: ${ahead} upload${ahead === 1 ? "" : "s"} ahead` : "Waiting to start"
  }
  return job.step ?? "Working…"
}
