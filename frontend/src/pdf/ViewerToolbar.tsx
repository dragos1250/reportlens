import { useEffect, useState } from "react"

import { Icon } from "../components/Icon"

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export function clampPage(page: number, pages: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, pages))
}

/** Icon buttons: 44px targets on phones (design floor), 36px from the md breakpoint. */
export const iconButton =
  "grid size-11 place-items-center rounded-md text-secondary hover:bg-line hover:text-text disabled:opacity-40 disabled:hover:bg-transparent md:size-9"

interface Props {
  page: number
  pages: number | null
  zoom: number
  onPage: (page: number) => void
  onZoom: (zoom: number) => void
}

export function ViewerToolbar({ page, pages, zoom, onPage, onZoom }: Props) {
  const [draft, setDraft] = useState(String(page))
  useEffect(() => setDraft(String(page)), [page])

  const total = pages ?? 1
  const zoomIndex = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number])

  function commit() {
    const next = clampPage(Number(draft), total)
    setDraft(String(next))
    if (next !== page) onPage(next)
  }

  return (
    <div className="grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel-soft px-1 md:px-4">
      <div className="flex items-center">
        <button type="button" aria-label="Previous page" className={iconButton}
                disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevron-left" />
        </button>
        <button type="button" aria-label="Next page" className={iconButton}
                disabled={pages === null || page >= total} onClick={() => onPage(page + 1)}>
          <Icon name="chevron-right" />
        </button>
      </div>

      <form className="flex items-center gap-1.5 text-xs text-secondary tabular-nums"
            onSubmit={(event) => { event.preventDefault(); commit() }}>
        <label htmlFor="page-input">Page</label>
        <input
          id="page-input"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          className="h-8 w-12 rounded-md border border-line-strong bg-transparent text-center text-xs text-text"
        />
        <span>of {pages ?? "…"}</span>
      </form>

      <div className="flex items-center justify-self-end text-xs text-secondary tabular-nums">
        <button type="button" aria-label="Zoom out" className={`${iconButton} max-md:hidden`}
                disabled={zoomIndex <= 0} onClick={() => onZoom(ZOOM_STEPS[zoomIndex - 1])}>
          <Icon name="minus" />
        </button>
        <span className="min-w-12 text-center" aria-label={`Zoom ${Math.round(zoom * 100)}%`}>
          {Math.round(zoom * 100)}%
        </span>
        <button type="button" aria-label="Zoom in" className={`${iconButton} max-md:hidden`}
                disabled={zoomIndex >= ZOOM_STEPS.length - 1} onClick={() => onZoom(ZOOM_STEPS[zoomIndex + 1])}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  )
}
