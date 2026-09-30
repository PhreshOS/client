import type { DesktopPlaneEvents, DesktopPlaneSource, DesktopSize } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** The plane of standard Windows the Desktop containing this Client shows a view of, and its size. */
export default class ClientPlane extends Events<DesktopPlaneEvents, never> implements DesktopPlaneSource {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-plane", event, value => {
        const size = event === "resize" ? createSize(value) : null
        if (size) listener(size)
      }, null, impossible),
      observer => wire.onAll("host-desktop-plane", (event, value) => {
        const size = event === "resize" ? createSize(value) : null
        if (size) observer("resize", size)
      })
    )
  }

  public async size() {
    const [value] = await wire.request(["desktopPlane"]) as [unknown]
    const size = createSize(value)
    if (!size) throw new Error("The System returned an invalid plane size")
    return size
  }
}

function createSize(value: unknown): DesktopSize | null {
  if (typeof value !== "object" || value === null) return null
  const { width, height } = value as { width?: unknown, height?: unknown }
  if (typeof width !== "number" || !Number.isFinite(width) || typeof height !== "number" || !Number.isFinite(height)) return null
  return Object.freeze({ width, height })
}
