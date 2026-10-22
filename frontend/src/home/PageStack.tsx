/** Decorative 3D stack of four translucent pages (the hero moment of the first screen). */
export function PageStack({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`page-stack ${className}`}>
      <div className="page-stack__shadow" />
      {[0, 1, 2, 3].map((page) => (
        <div className="page-stack__page" key={page}>
          <span className="page-stack__line" style={{ width: 56, height: 4, marginBottom: 16 }} />
          <span className="page-stack__line" style={{ width: "73%", height: 10, marginBottom: 24 }} />
          <span className="page-stack__line" style={{ width: "100%" }} />
          <span className="page-stack__line" style={{ width: "75%" }} />
          <span className="page-stack__line" style={{ width: "60%" }} />
          <span className="page-stack__bars">
            <i style={{ height: "36%" }} />
            <i style={{ height: "56%" }} />
            <i style={{ height: "46%" }} />
            <i style={{ height: "76%" }} />
          </span>
        </div>
      ))}
    </div>
  )
}
