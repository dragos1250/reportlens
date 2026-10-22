/** The ReportLens mark: a page outline over another, with a yellow highlighter bar. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="12.5" y="9.5" width="11" height="15" rx="2" stroke="var(--color-muted)" strokeWidth="1.5" />
      <rect x="8.5" y="6.5" width="11" height="15" rx="2" fill="var(--color-app)" stroke="var(--color-text)" strokeWidth="1.5" />
      <rect x="11" y="10.5" width="6" height="2" rx="1" fill="var(--color-accent)" />
    </svg>
  )
}

export function Brand() {
  return (
    <span className="flex items-center gap-2 text-base font-semibold tracking-tight text-text">
      <BrandMark />
      ReportLens
    </span>
  )
}
