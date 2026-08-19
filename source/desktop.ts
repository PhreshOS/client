import type { Subscribable } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** The complete measured desktop area in CSS pixels. */
export type DesktopSize = Readonly<{
  width: number
  height: number
}>

/** Live changes to the desktop area containing this Client. */
export type DesktopEvents = {
  /** The desktop area resized. */
  resize: DesktopSize
}

/** Explicit desktop size reads and future resizes. */
export interface HostDesktop extends Subscribable<DesktopEvents, never> {
  /** Reads the complete current desktop area in CSS pixels. */
  size(): Promise<DesktopSize>
}

/** Desktop access bound to the current Client Process boundary. */
export default class ClientDesktop extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop", event, value => {
        const size = createSize(value)
        if (size) listener(size)
      }, null, impossible),
      observer => wire.onAll("host-desktop", (event, value) => {
        const size = createSize(value)
        if (typeof event === "string" && size) observer(event, size)
      })
    )
  }

  public async size() {
    const answer = await wire.request(["desktop"]) as [unknown]
    const size = createSize(answer[0])
    if (!size) throw new Error("The host returned an invalid desktop size")
    return size
  }
}

function createSize(value: unknown): DesktopSize | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const size = value as Partial<DesktopSize>
  if (!finite(size.width) || !finite(size.height)) return null
  return Object.freeze({ width: size.width, height: size.height })
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
