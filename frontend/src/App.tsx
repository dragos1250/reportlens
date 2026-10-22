import { useState } from "react"

import type { DocumentInfo } from "./api/types"
import { DocumentPicker } from "./home/DocumentPicker"

export default function App() {
  const [document, setDocument] = useState<DocumentInfo | null>(null)

  if (document === null) {
    return <DocumentPicker onOpen={setDocument} />
  }
  return (
    <main className="grid min-h-full place-items-center">
      <p className="text-secondary">{document.title}</p>
    </main>
  )
}
