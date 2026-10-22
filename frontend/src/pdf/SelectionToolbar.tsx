import { type RefObject, type SyntheticEvent, useEffect, useRef, useState } from "react"

import type { Selection } from "../api/types"
import { Icon } from "../components/Icon"
import { readSelection } from "./selection"

interface Props {
  /** The viewer area: selections are read inside it and the toolbar is placed in it. */
  containerRef: RefObject<HTMLElement | null>
  page: number
  onExplain: (selection: Selection) => void
  onAsk: (selection: Selection) => void
}

type Shown =
  | { kind: "selection"; selection: Selection; top: number; left: number }
  | { kind: "several-pages" }
  | null

/**
 * Small floating toolbar above the reader's selection in the PDF text layer:
 * "Explain this" and "Ask about this". Hidden on Escape, scroll, page change, or when the
 * selection goes away.
 */
export function SelectionToolbar({ containerRef, page, onExplain, onAsk }: Props) {
  const [shown, setShown] = useState<Shown>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = (event: Event) => {
      // A press on the toolbar itself must not re-read (and lose) the selection.
      if (event.target instanceof Node && toolbarRef.current?.contains(event.target)) return
      const read = readSelection(window.getSelection(), container)
      if (read.kind === "none") return setShown(null)
      if (read.kind === "several-pages") return setShown({ kind: "several-pages" })
      const area = container.getBoundingClientRect()
      setShown({
        kind: "selection",
        selection: read.selection,
        top: Math.max(8, read.box.top - area.top),
        left: Math.min(Math.max(read.box.left + read.box.width / 2 - area.left, 120), Math.max(area.width - 120, 120)),
      })
    }
    const hide = () => setShown(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide()
      else update(event)
    }
    const onSelectionChange = () => {
      if (window.getSelection()?.isCollapsed) hide()
    }

    container.addEventListener("pointerup", update)
    container.addEventListener("keyup", onKey)
    container.addEventListener("scroll", hide, true) // scroll events do not bubble: capture them
    document.addEventListener("selectionchange", onSelectionChange)
    return () => {
      container.removeEventListener("pointerup", update)
      container.removeEventListener("keyup", onKey)
      container.removeEventListener("scroll", hide, true)
      document.removeEventListener("selectionchange", onSelectionChange)
    }
  }, [containerRef])

  useEffect(() => {
    setShown(null)
  }, [page])

  if (shown === null) return null

  if (shown.kind === "several-pages") {
    return (
      <p role="status" className="absolute top-3 left-1/2 z-20 m-0 -translate-x-1/2 rounded-lg border border-line-strong bg-panel px-3 py-2 text-xs text-secondary shadow-lg">
        Select text on one page.
      </p>
    )
  }

  const keepSelection = (event: SyntheticEvent) => event.preventDefault()
  const act = (handler: (selection: Selection) => void) => {
    handler(shown.selection)
    setShown(null)
  }

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selected text"
      onPointerDown={keepSelection}
      onMouseDown={keepSelection}
      style={{ top: shown.top, left: shown.left }}
      className="absolute z-20 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center rounded-lg border border-line-strong bg-panel p-1 text-text shadow-[0_8px_24px_rgb(0_0_0/0.3)]"
    >
      <button type="button" onClick={() => act(onExplain)}
              className="flex min-h-11 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold hover:bg-line md:min-h-8">
        <Icon name="spark" size={15} /> Explain this
      </button>
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line-strong" />
      <button type="button" onClick={() => act(onAsk)}
              className="min-h-11 rounded-md px-2.5 text-xs font-semibold hover:bg-line md:min-h-8">
        Ask about this
      </button>
    </div>
  )
}
