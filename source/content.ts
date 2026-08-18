export type ContentBody = Blob | ReadableStream<Uint8Array>

/** Converts one authored value into the browser body and metadata used by storage and serving. */
export function content(value: unknown): { body: ContentBody, extension: string, type: string } {
  const binary = "application/octet-stream"

  if (typeof File !== "undefined" && value instanceof File) {
    const type = value.type || binary
    return { body: value, extension: extension(value.name, type), type }
  }
  if (value instanceof Blob) {
    const type = value.type || binary
    return { body: value, extension: extension("", type), type }
  }
  if (value instanceof ReadableStream) return { body: value, extension: "bin", type: binary }
  if (typeof value === "string") return { body: new Blob([value]), extension: "txt", type: "text/plain" }
  if (value instanceof ArrayBuffer) return { body: new Blob([value]), extension: "bin", type: binary }

  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    return { body: new Blob([bytes.slice()]), extension: "bin", type: binary }
  }

  const json = JSON.stringify(value)
  if (json === undefined) throw new Error("This value cannot be written as JSON")
  return { body: new Blob([json]), extension: "json", type: "application/json" }
}

const extensions: Record<string, string> = {
  "application/gzip": "gz",
  "application/javascript": "js",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/wasm": "wasm",
  "application/zip": "zip",
  "audio/mpeg": "mp3",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "text/css": "css",
  "text/csv": "csv",
  "text/html": "html",
  "text/javascript": "js",
  "text/plain": "txt",
  "video/mp4": "mp4"
}

function extension(name: string, type: string) {
  return name.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase()
    ?? extensions[type.split(";", 1)[0]!.toLowerCase()]
    ?? "bin"
}
