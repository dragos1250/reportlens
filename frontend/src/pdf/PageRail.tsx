import type { MouseEvent } from "react"

import { pageAt, railPosition, tickPages } from "./rail"

interface Props {
  pages: number | null
  current: number
  cited: number[] // pages cited in the conversation
  onPage: (page: number) => void
}

/**
 * Vertical map of the whole document: hairline ticks, cited pages in teal, the current
 * page as a yellow bar. Clicking jumps to the page at that height; keyboard users have
 * the page field in the toolbar.
 */
export function PageRail({ pages, current, cited, onPage }: Props) {
  if (pages === null) return <div className="border-r border-line bg-rail" />

  function jump(event: MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect()
    onPage(pageAt((event.clientY - box.top) / box.height, pages!))
  }

  const top = (page: number) => `${railPosition(page, pages) * 100}%`
  const citedPages = [...new Set(cited)]

  return (
    <nav aria-label="Document pages" className="grid grid-rows-[auto_1fr_auto] justify-items-center gap-2 border-r border-line bg-rail py-3">
      <span aria-hidden="true" className="text-xs text-muted tabular-nums">1</span>
      <button
        type="button"
        onClick={jump}
        aria-label={`Jump to page: page ${current} of ${pages}, ${citedPages.length} cited`}
        className="relative w-full cursor-pointer"
      >
        {tickPages(pages).map((page) => (
          <span key={`t${page}`} aria-hidden="true" data-testid="rail-tick"
                className="absolute left-1/2 h-px w-2 -translate-x-1/2 bg-rail-tick" style={{ top: top(page) }} />
        ))}
        {citedPages.map((page) => (
          <span key={`c${page}`} aria-hidden="true" data-testid="rail-cited"
                className="absolute left-1/2 h-0.5 w-3 -translate-x-1/2 bg-teal md:w-[18px]" style={{ top: top(page) }} />
        ))}
        <span aria-hidden="true" data-testid="rail-current"
              className="absolute left-1/2 h-[3px] w-4 -translate-x-1/2 bg-accent transition-[top] duration-200 md:w-6"
              style={{ top: top(current) }} />
      </button>
      <span aria-hidden="true" className="text-xs text-muted tabular-nums">{pages}</span>
    </nav>
  )
}
