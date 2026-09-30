import { parseAppearanceTransaction, type DesktopOffset, type DesktopSize, type DesktopViewportEvents, type DesktopViewportMove, type WritableDesktopViewportSource } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** The Desktop viewport containing this Client Endpoint: its size, where it looks on the plane, and moving that view. */
export default class ClientViewport extends Events<DesktopViewportEvents, never> implements WritableDesktopViewportSource {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-viewport", event, value => {
        const parsed = parse(event, value)
        if (parsed) listener(parsed as never)
      }, null, impossible),
      observer => wire.onAll("host-desktop-viewport", (event, value) => {
        const parsed = typeof event === "string" ? parse(event, value) : null
        if (typeof event === "string" && parsed) observer(event, parsed)
      })
    )
  }

  public async size() {
    const size = createSize((await state()).size)
    if (!size) throw new Error("The System returned an invalid Desktop size")
    return size
  }

  public async offset() {
    const offset = createOffset((await state()).offset)
    if (!offset) throw new Error("The System returned an invalid Desktop offset")
    return offset
  }

  public async move(offset: DesktopOffset) {
    const target = createOffset(offset)
    if (!target) throw new Error("A Desktop offset needs finite x and y")
    await wire.request(["moveDesktopViewport", target])
  }
}

async function state() {
  const answer = await wire.request(["desktopViewport"]) as [unknown]
  return record(answer[0]) ? answer[0] : {}
}

function parse(event: unknown, value: unknown) {
  if (event === "resize") return createSize(value)
  if (event === "move") return createMove(value)
  return null
}

function createMove(value: unknown): DesktopViewportMove | null {
  if (!record(value)) return null
  const offset = createOffset(value.offset)
  if (!offset) return null
  const transaction = value.transaction === null ? null : parseAppearanceTransaction(value.transaction)
  return Object.freeze({ offset, transaction })
}

function createSize(value: unknown): DesktopSize | null {
  if (!record(value) || !finite(value.width) || !finite(value.height)) return null
  return Object.freeze({ width: value.width, height: value.height })
}

function createOffset(value: unknown): DesktopOffset | null {
  if (!record(value) || !finite(value.x) || !finite(value.y)) return null
  return Object.freeze({ x: value.x, y: value.y })
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
