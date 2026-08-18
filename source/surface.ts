import type { Subscribable } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** The available workspace of this Client Window's layer. */
export type Surface = Readonly<{
  /** Available width in CSS pixels. */
  width: number

  /** Available height in CSS pixels. */
  height: number
}>

/** Live changes to this Client Window's surface. */
export type SurfaceEvents = {
  /** The available workspace resized. */
  resize: Surface
}

/** Explicit surface size reads and future resizes. */
export interface HostSurface extends Subscribable<SurfaceEvents, never> {
  /** Reads this Client Window's current surface. */
  size(): Promise<Surface>
}

/** Client surface access bound to the current Process boundary. */
export default class ClientSurface extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-surface", event, value => {
        const surface = createSurface(value)
        if (surface) listener(surface)
      }, null, impossible),
      observer => wire.onAll("host-surface", (event, value) => {
        const surface = createSurface(value)
        if (typeof event === "string" && surface) observer(event, surface)
      })
    )
  }

  public async size() {
    const answer = await wire.request(["surface"]) as [unknown]
    const surface = createSurface(answer[0])
    if (!surface) throw new Error("The desktop returned an invalid Surface size")
    return surface
  }
}

function createSurface(value: unknown): Surface | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const surface = value as Partial<Surface>
  if (!finite(surface.width) || !finite(surface.height)) return null
  return Object.freeze({ width: surface.width, height: surface.height })
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
