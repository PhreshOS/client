import type { Subscribable } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Pointer coordinates relative to the desktop display core. */
export type PointerPosition = Readonly<{
  /** Horizontal coordinate in CSS pixels. */
  x: number

  /** Vertical coordinate in CSS pixels. */
  y: number
}>

/** Live pointer events visible to this Client. */
export type PointerEvents = {
  /** The pointer moved over the desktop display core. */
  move: PointerPosition
}

/** Permission-guarded pointer positions and future movement. */
export interface HostPointer extends Subscribable<PointerEvents, never> {
  /**
   * Reads the current desktop pointer position, or `null` before one is known.
   * Rejects unless the `pointer` permission is currently granted.
   */
  position(): Promise<PointerPosition | null>
}

/** Client pointer access bound to the current Process boundary. */
export default class ClientPointer extends Events {
  private listeners = 0
  private readonly sample = (event: PointerEvent) => wire.samplePointer(event.movementX, event.movementY)

  public constructor() {
    super(
      (event, listener, impossible) => this.withSampling(
        event === "move",
        wire.on("host-pointer", event, value => {
          const position = createPosition(value)
          if (position) listener(position)
        }, null, impossible)
      ),
      observer => this.withSampling(true, wire.onAll("host-pointer", (event, value) => {
        const position = createPosition(value)
        if (event === "move" && position) observer(event, position)
      }))
    )
  }

  public async position() {
    const answer = await wire.request(["pointer"]) as [unknown]
    if (answer[0] === null) return null
    const position = createPosition(answer[0])
    if (!position) throw new Error("The desktop returned an invalid Pointer position")
    return position
  }

  private withSampling(sample: boolean, stop: () => void) {
    if (!sample) return stop
    if (this.listeners++ === 0) window.addEventListener("pointermove", this.sample)

    let active = true
    return () => {
      if (!active) return
      active = false
      stop()
      this.listeners--
      if (this.listeners === 0) window.removeEventListener("pointermove", this.sample)
    }
  }
}

function createPosition(value: unknown): PointerPosition | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const position = value as Partial<PointerPosition>
  if (!finite(position.x) || !finite(position.y)) return null
  return Object.freeze({ x: position.x, y: position.y })
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
