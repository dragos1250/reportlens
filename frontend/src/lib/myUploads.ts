/**
 * The reports this browser uploaded. Uploads are unlisted on the server: their random id
 * is the only key, and it is kept here, in localStorage. Storage can be unavailable
 * (private mode): then the list is simply empty.
 */
const KEY = "reportlens.my-uploads"

export interface MyUpload {
  docId: string
  title: string
}

export function readUploads(): MyUpload[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((u): u is MyUpload => typeof u?.docId === "string" && typeof u?.title === "string")
      : []
  } catch {
    return []
  }
}

function write(uploads: MyUpload[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(uploads))
  } catch {
    // Not kept; the report still opens now, it just will not be listed next time.
  }
}

export function rememberUpload(upload: MyUpload): void {
  write([upload, ...readUploads().filter((u) => u.docId !== upload.docId)])
}

export function forgetUpload(docId: string): void {
  write(readUploads().filter((u) => u.docId !== docId))
}
