import type { Message, Passage } from "../api/types"
import { Icon } from "../components/Icon"
import type { DocLabel } from "../lib/reports"
import { checkedPlaces } from "./citations"

interface Props {
  message: Message
  onPage: (passage: Passage) => void
  onRephrase: () => void
  /** Opens the exact text search (no AI) over the report. */
  onSearchReport: () => void
  /** When comparing two reports: name each checked page's report. */
  docLabel?: DocLabel
}

/**
 * Calm refusal, never styled as an error. not_found: passages were checked and did not
 * support an answer (their pages are listed). not_in_report: nothing came close enough to
 * check, so no LLM call was made.
 */
export function NotInReport({ message, onPage, onRephrase, onSearchReport, docLabel }: Props) {
  const places = checkedPlaces(message.passages)
  const comparing = docLabel !== undefined
  return (
    <div className="pt-1">
      <div className="rounded-xl border border-dashed border-line-strong bg-[repeating-linear-gradient(-45deg,transparent,transparent_7px,rgb(230_237_243/0.018)_7px,rgb(230_237_243/0.018)_8px)] px-6 pt-7 pb-6 text-center">
        <span className="mx-auto mb-3 grid w-fit text-secondary"><Icon name="search" size={20} /></span>
        <h3 className="m-0 mb-2 text-lg font-semibold tracking-tight">{comparing ? "Not in these reports" : "Not in this report"}</h3>
        <p className="mx-auto m-0 max-w-[300px] font-reading text-[13px] leading-relaxed text-secondary">
          I couldn’t find a supported answer in {comparing ? "either document" : "the document"}, so I won’t make one up.
        </p>
        {places.length > 0 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <span className="w-full text-xs text-secondary">Checked</span>
            {places.map((passage) => {
              const report = docLabel?.(passage.docId)
              return (
                <button
                  key={`${passage.docId}-${passage.page}`}
                  type="button"
                  onClick={() => onPage(passage)}
                  aria-label={`Show checked page ${passage.page}${report ? ` of ${report}` : ""}`}
                  className="inline-flex min-h-8 items-center rounded-[5px] border border-line-strong bg-white/[0.025] px-2 text-xs tabular-nums hover:border-accent hover:text-accent"
                >
                  {report && <span className="mr-1 text-secondary">{report}</span>}p. {passage.page}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="m-0 mt-4 text-xs text-secondary">No passage was close enough to check.</p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSearchReport}
          className="flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-3 text-sm text-text hover:border-accent md:min-h-9"
        >
          <Icon name="search" size={16} />
          Search the report text
        </button>
        <button
          type="button"
          onClick={onRephrase}
          className="min-h-11 rounded-lg px-3 text-sm text-secondary hover:text-text md:min-h-9"
        >
          Rephrase
        </button>
      </div>
    </div>
  )
}
