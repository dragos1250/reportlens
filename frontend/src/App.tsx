import { useState } from "react"

import type { DocumentInfo } from "./api/types"
import { DocumentPicker } from "./home/DocumentPicker"
import { Workspace } from "./workspace/Workspace"

export default function App() {
  const [document, setDocument] = useState<DocumentInfo | null>(null)

  if (document === null) {
    return <DocumentPicker onOpen={setDocument} />
  }
  return <Workspace document={document} onClose={() => setDocument(null)} />
}
