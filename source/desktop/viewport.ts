import type { DesktopViewportEvents, DesktopViewportSnapshot, DesktopViewportSource } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** Read-only access to the Desktop viewport containing this Client Endpoint. */
export default class ClientViewport extends Events<DesktopViewportEvents, never> implements DesktopViewportSource {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-viewport", event, value => {
        const snapshot = createSnapshot(value)
        if (snapshot) listener(snapshot)
      }, null, impossible),
      observer => wire.onAll("host-desktop-viewport", (event, value) => {
        const snapshot = createSnapshot(value)
        if (typeof event === "string" && snapshot) observer(event, snapshot)
      })
    )
  }

  public async snapshot() {
    const answer = await wire.request(["desktopViewport"]) as [unknown]
    const snapshot = createSnapshot(answer[0])
    if (!snapshot) throw new Error("The System returned an invalid Desktop viewport")
    return snapshot
  }
}

function createSnapshot(value: unknown): DesktopViewportSnapshot | null {
  if (!record(value) || !record(value.size)) return null
  const { width, height } = value.size
  if (!finite(width) || !finite(height)) return null
  return Object.freeze({ size: Object.freeze({ width, height }) })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
