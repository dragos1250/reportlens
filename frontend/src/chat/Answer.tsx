import type { Message, Passage } from "../api/types"
import { Icon } from "../components/Icon"
import type { DocLabel } from "../lib/reports"
import { splitAnswer } from "./citations"

interface CiteProps {
  activeChunkId: string | null
  onCite: (passage: Passage) => void
  /** When comparing two reports: which report a citation points to. */
  docLabel?: DocLabel
}

export function CitationChip({ passage, activeChunkId, onCite, docLabel }: CiteProps & { passage: Passage }) {
  const active = passage.chunkId === activeChunkId
  const report = docLabel?.(passage.docId)
  return (
    <button
      type="button"
      onClick={() => onCite(passage)}
      aria-label={report ? `Show page ${passage.page} of ${report}` : `Show page ${passage.page}`}
      aria-pressed={active}
      className={`mx-0.5 inline-flex min-h-6 items-center rounded-[5px] border px-1.5 align-[1px] font-ui text-xs tabular-nums transition-colors hover:border-accent hover:text-accent max-md:min-h-8 ${
        active ? "border-accent text-accent" : "border-line-strong bg-white/[0.025] text-text"
      }`}
    >
      {report && <span className="mr-1 text-secondary">{report}</span>}p. {passage.page}
    </button>
  )
}

/** The answer text with clickable citations. */
export function AnswerText({ message, activeChunkId, onCite, docLabel }: CiteProps & { message: Message }) {
  return (
    <p className="m-0 font-reading text-base leading-relaxed text-answer">
      {splitAnswer(message.content, message.passages).map((segment, i) =>
        segment.kind === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          segment.passages.map((passage) => (
            <CitationChip key={`${i}-${passage.marker}`} passage={passage} activeChunkId={activeChunkId} onCite={onCite}
                          docLabel={docLabel} />
          ))
        ),
      )}
    </p>
  )
}

/** Cited passages: page, two-line snippet. Clicking a row equals clicking its chip. */
export function Sources({ message, activeChunkId, onCite, docLabel }: CiteProps & { message: Message }) {
  const cited = message.passages.filter((p) => p.cited)
  return (
    <section aria-label="Sources" className="mt-5 border-t border-line pt-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold">Sources</h3>
        <span className="text-xs text-secondary">
          {message.passages.length} passages checked, {cited.length} cited
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {cited.map((passage) => {
          const active = passage.chunkId === activeChunkId
          const report = docLabel?.(passage.docId)
          return (
            <li key={passage.chunkId}>
              <button
                type="button"
                onClick={() => onCite(passage)}
                aria-label={`Show page ${passage.page}${report ? ` of ${report}` : ""}: ${passage.text.slice(0, 80)}`}
                className={`grid min-h-11 w-full grid-cols-[44px_1fr_16px] items-center gap-3 rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
                  active ? "border-accent/25 bg-accent/[0.035]" : "border-transparent border-t-line hover:bg-white/[0.02]"
                }`}
              >
                <span className="text-2xl font-medium text-accent tabular-nums">{passage.page}</span>
                <span className="line-clamp-2 font-reading text-[13px] leading-snug text-secondary">
                  {report && <span className="mr-1 font-ui text-xs text-text">{report}</span>}
                  “{passage.text}”
                </span>
                <span className="text-secondary"><Icon name="arrow" size={16} /></span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
