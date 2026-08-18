interface LogWire { send(route: string, ...values: unknown[]): void }
type Kind = "debug" | "log" | "info" | "warn" | "error"

/** Mirrors browser output through the private boundary without changing it. */
export default function captureClientOutput(wire: LogWire) {
  if (typeof document === "undefined") return

  const output = console as unknown as Record<Kind, (...values: unknown[]) => void>
  let relaying = false

  const relay = (kind: Kind, values: unknown[]) => queueMicrotask(() => {
    if (relaying) return
    relaying = true
    try { wire.send("boundary", "log", kind, values.map(printable).join(" ")) }
    catch { /* Output is emit-and-forget. */ }
    finally { relaying = false }
  })

  for (const kind of ["debug", "log", "info", "warn", "error"] as const) {
    const original = output[kind].bind(console)
    output[kind] = (...values) => {
      original(...values)
      relay(kind, values)
    }
  }

  window.addEventListener("error", event => relay("error", [event.error ?? event.message]))
  window.addEventListener("unhandledrejection", event => relay("error", [`Unhandled rejection: ${printable(event.reason)}`]))
}

function printable(value: unknown): string {
  if (typeof value === "string") return value
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  if (typeof value === "undefined") return "undefined"
  if (typeof value === "bigint") return `${value}n`
  if (typeof value === "symbol" || typeof value === "function") return String(value)

  try {
    const seen = new WeakSet<object>()
    const json = JSON.stringify(value, (_key, nested: unknown) => {
      if (typeof nested === "bigint") return `${nested}n`
      if (nested instanceof Error) return { name: nested.name, message: nested.message, stack: nested.stack }
      if (typeof nested !== "object" || nested === null) return nested
      if (seen.has(nested)) return "[Circular]"
      seen.add(nested)
      return nested
    })
    if (json !== undefined) return json
  } catch { /* Fall through. */ }

  try { return String(value) }
  catch { return "[Unprintable value]" }
}
