import type { DesktopPointerSnapshot } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** Permission-guarded access to the Desktop pointer visible to this Client. */
export default class ClientPointer extends Events {
  private listeners = 0
  private readonly sample = (event: PointerEvent) => wire.samplePointer(event.movementX, event.movementY)

  public constructor() {
    super(
      (event, listener, impossible) => this.withSampling(
        event === "move",
        wire.on("host-desktop-pointer", event, value => {
          const snapshot = createSnapshot(value)
          if (snapshot) listener(snapshot)
        }, null, impossible)
      ),
      observer => this.withSampling(true, wire.onAll("host-desktop-pointer", (event, value) => {
        const snapshot = createSnapshot(value)
        if (event === "move" && snapshot) observer(event, snapshot)
      }))
    )
  }

  public async snapshot() {
    const answer = await wire.request(["desktopPointer"]) as [unknown]
    const snapshot = createSnapshot(answer[0])
    if (!snapshot) throw new Error("The Desktop returned an invalid pointer")
    return snapshot
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

function createSnapshot(value: unknown): DesktopPointerSnapshot | null {
  if (!record(value)) return null
  if (value.position === null) return Object.freeze({ position: null })
  if (!record(value.position)) return null
  const { x, y } = value.position
  if (!finite(x) || !finite(y)) return null
  return Object.freeze({ position: Object.freeze({ x, y }) })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
