import { useState } from "react"

import type { DocumentInfo, UploadAccepted } from "./api/types"
import { DocumentPicker } from "./home/DocumentPicker"
import { Processing } from "./home/Processing"
import { rememberUpload } from "./lib/myUploads"
import { Workspace } from "./workspace/Workspace"

type Screen =
  | { name: "picker" }
  | { name: "processing"; upload: UploadAccepted }
  | { name: "workspace"; document: DocumentInfo }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "picker" })
  const toPicker = () => setScreen({ name: "picker" })

  if (screen.name === "processing") {
    return (
      <Processing
        upload={screen.upload}
        onReady={(document) => setScreen({ name: "workspace", document })}
        onBack={toPicker}
      />
    )
  }
  if (screen.name === "workspace") {
    return <Workspace document={screen.document} onClose={toPicker} />
  }
  return (
    <DocumentPicker
      onOpen={(document) => setScreen({ name: "workspace", document })}
      onUploaded={(upload) => {
        // Remembered at once: leaving during processing still finds it under "Your uploads".
        rememberUpload({ docId: upload.docId, title: upload.title })
        setScreen({ name: "processing", upload })
      }}
    />
  )
}
