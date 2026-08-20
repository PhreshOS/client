import type { Cleanup, Outcome, ServiceKey } from "@phreshos/core"
import Deadline from "./deadline.js"
import type { HandleAddress } from "./domain.js"
import { defaultTimeout } from "./events.js"
import captureClientOutput from "./log.js"
import { deserialize, serialize } from "./messagepack.js"

type Handler = (...values: unknown[]) => unknown
type Failure = (error: Error) => void
type TrafficKind = "publish" | "ask" | "answer"

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

/** The client endpoint's sole postMessage adapter. */
class Wire {
  private readonly parent = window.parent === window ? null : window.parent
  private readonly pending = new Map<string, Pending>()
  private readonly subscribers = new Map<string, Set<Handler>>()
  private readonly every = new Map<string, Set<Handler>>()
  private readonly impossible = new Map<string, Failure>()
  private identityPromise: Promise<{ process: string, reference: string }> | null = null

  public constructor() {
    this.send("boundary", "document", crypto.randomUUID())

    window.addEventListener("message", event => {
      if (event.source !== this.parent || !Array.isArray(event.data)) return

      const [bytes, ...attachments] = event.data as unknown[]
      if (!(bytes instanceof Uint8Array)) return

      let message: unknown
      try { message = deserialize(bytes, attachments) }
      catch { return }
      if (!Array.isArray(message) || typeof message[0] !== "string") return

      const [route, ...values] = message as [string, ...unknown[]]

      if (route === "boundary") {
        const [operation, ...rest] = values
        if (operation === "impossible" && typeof rest[0] === "string" && typeof rest[1] === "string") {
          this.impossible.get(rest[0])?.(new Error(rest[1]))
          this.impossible.delete(rest[0])
        }
        return
      }

      if (values[0] === "answer" && typeof values[1] === "string") {
        this.settle(values[1], values.at(-1) as Outcome)
        return
      }

      this.deliver(route, values)
    })
  }

  public send(route: string, ...values: unknown[]) {
    this.post([route, ...values])
  }

  public request(values: unknown[], timeout = defaultTimeout, transfer: Transferable[] = []): Promise<unknown> {
    return this.question("end-host", values, timeout, transfer)
  }

  /** Requests a value while treating the caller's deadline as an absent answer. */
  public requestOrNull(values: unknown[], timeout: number): Promise<unknown | null> {
    return this.question("end-host", values, timeout, [], timeout, true)
  }

  public requestWithin(values: unknown[], deadline: Deadline, transfer: Transferable[] = []): Promise<unknown> {
    return this.question("end-host", values, deadline.remaining(), transfer, deadline.milliseconds)
  }

  public askServerWithin(event: string, payload: unknown, deadline: Deadline): Promise<unknown> {
    return this.question("end-end", [event, payload], deadline.remaining(), [], deadline.milliseconds)
  }

  /** Resolves this endpoint's Process address only for operations that need it. */
  public identity() {
    if (!this.identityPromise) {
      const resolving = this.request(["process"]).then(value => {
        const [record] = value as [{ identity?: unknown, reference?: unknown }]
        if (typeof record?.identity !== "string" || typeof record.reference !== "string") {
          throw new Error("The desktop returned an invalid Process identity")
        }
        return { process: record.identity, reference: record.reference }
      })
      const retained = resolving.catch(error => {
        if (this.identityPromise === retained) this.identityPromise = null
        throw error
      })
      this.identityPromise = retained
    }
    return this.identityPromise
  }

  private question(route: "end-host" | "end-end", values: unknown[], timeout: number, transfer: Transferable[] = [], reportedTimeout = timeout, nullOnTimeout = false) {
    return new Promise<unknown>((resolve, reject) => {
      let active = true
      let question: string | null = null

      const timer = setTimeout(() => {
        if (!active) return
        active = false
        if (question) {
          this.pending.delete(question)
          this.send("boundary", "forget", question)
        }
        if (nullOnTimeout) resolve(null)
        else reject(new Error(`Answer timeout ${reportedTimeout}ms`))
      }, timeout)

      const begin = route === "end-end" ? this.identity() : Promise.resolve({ process: crypto.randomUUID() })

      begin.then(({ process: identity }) => {
        if (!active) return

        question = `client:${identity}:${crypto.randomUUID()}`
        const publicId = crypto.randomUUID()
        this.send("boundary", "expect", question)
        this.pending.set(question, {
          timer,
          resolve: value => {
            if (!active) return
            active = false
            resolve(value)
          },
          reject: error => {
            if (!active) return
            active = false
            reject(error)
          }
        })

        const message = route === "end-end"
          ? [route, "wait", question, publicId, ...values]
          : [route, "wait", question, ...values]

        try { this.post(message, transfer) }
        catch (error) {
          this.pending.delete(question)
          this.send("boundary", "forget", question)
          clearTimeout(timer)
          active = false
          reject(error)
        }
      }).catch(error => {
        if (!active) return
        active = false
        clearTimeout(timer)
        reject(error)
      })
    })
  }

  private post(message: unknown[], transfer: Transferable[] = []) {
    if (!this.parent) return

    const attachments = nativeAttachments(message, transfer)
    const bytes = serialize(message, attachments)

    this.parent.postMessage([bytes, ...attachments], "*", [bytes.buffer, ...transfer])
  }

  public expectWithin(question: string, deadline: Deadline): Promise<unknown> {
    this.send("boundary", "expect", question)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(question)
        this.send("boundary", "forget", question)
        reject(new Error(`Answer timeout ${deadline.milliseconds}ms`))
      }, deadline.remaining())
      this.pending.set(question, { resolve, reject, timer })
    })
  }

  public forget(question: string) {
    const pending = this.pending.get(question)
    if (pending) clearTimeout(pending.timer)
    this.pending.delete(question)
    this.send("boundary", "forget", question)
  }

  public on(route: string, event: string, handler: Handler, subject: string | null = null, impossible?: Failure): Cleanup {
    const key = `${route}:${event}`
    const handlers = this.subscribers.get(key) ?? new Set()
    handlers.add(handler)
    this.subscribers.set(key, handlers)
    const subscription = this.register("publish", route, event, subject, impossible)

    return once(() => {
      handlers.delete(handler)
      if (!handlers.size) this.subscribers.delete(key)
      this.unregister(subscription)
    })
  }

  public onAll(route: string, handler: Handler, subject: string | null = null): Cleanup {
    const handlers = this.every.get(route) ?? new Set()
    handlers.add(handler)
    this.every.set(route, handlers)
    const subscription = this.register("publish", route, null, subject)

    return once(() => {
      handlers.delete(handler)
      if (!handlers.size) this.every.delete(route)
      this.unregister(subscription)
    })
  }

  public observe(
    target: HandleAddress | null,
    half: "server" | "client",
    kind: TrafficKind,
    event: string | null,
    handler: Handler,
    impossible?: Failure
  ): Cleanup {
    const subscription = crypto.randomUUID()
    const stop = this.on("observed", subscription, handler)
    if (impossible) this.impossible.set(subscription, impossible)
    this.send("end-host", "observe", subscription, target, half, kind, event, impossible !== undefined)

    return once(() => {
      stop()
      this.impossible.delete(subscription)
      this.send("end-host", "unobserve", subscription)
    })
  }

  /** Follow destinationless events emitted by one Endpoint. */
  public follow(
    target: HandleAddress | null,
    half: "server" | "client",
    event: string | null,
    handler: Handler,
    impossible?: Failure
  ): Cleanup {
    const subscription = crypto.randomUUID()
    const stop = this.on("emitted", subscription, handler)
    if (impossible) this.impossible.set(subscription, impossible)
    this.send("end-host", "follow", subscription, target, half, event, impossible !== undefined)

    return once(() => {
      stop()
      this.impossible.delete(subscription)
      this.send("end-host", "unfollow", subscription)
    })
  }

  /** Follow one exact service lifecycle or application event route. */
  public followService(
    key: ServiceKey,
    scope: "lifecycle" | "channel",
    event: string | null,
    handler: Handler
  ): Cleanup {
    const subscription = crypto.randomUUID()
    const stop = this.on("service-event", subscription, handler)

    this.send("end-host", "service-follow", subscription, key, scope, event)

    return once(() => {
      stop()
      this.send("end-host", "service-unfollow", subscription)
    })
  }

  public samplePointer(movementX: number, movementY: number) {
    this.send("end-host", "pointerSample", movementX, movementY)
  }

  private register(kind: TrafficKind, route: string, event: string | null, subject: string | null, impossible?: Failure) {
    const subscription = crypto.randomUUID()
    if (impossible) this.impossible.set(subscription, impossible)
    this.send("boundary", "subscribe", subscription, kind, route, event, subject, impossible !== undefined)
    return subscription
  }

  private unregister(subscription: string) {
    this.impossible.delete(subscription)
    this.send("boundary", "unsubscribe", subscription)
  }

  private deliver(route: string, values: unknown[]) {
    const [event, ...message] = values
    if (typeof event !== "string") return
    for (const handler of [...this.subscribers.get(`${route}:${event}`) ?? []]) invoke(handler, message)
    for (const observer of [...this.every.get(route) ?? []]) invoke(observer, [event, ...message])
  }

  private settle(question: string, outcome: Outcome) {
    const pending = this.pending.get(question)
    if (!pending) return
    this.pending.delete(question)
    clearTimeout(pending.timer)
    this.send("boundary", "forget", question)

    if (outcome?.success === true) pending.resolve(outcome.result)
    else if (outcome?.success === false && typeof outcome.error === "string") pending.reject(new Error(outcome.error))
    else pending.reject(new Error("The boundary returned an invalid outcome"))
  }
}

function invoke(handler: Handler, values: unknown[]) {
  Promise.resolve().then(() => handler(...values)).catch(error => queueMicrotask(() => { throw error }))
}

function once(cleanup: Cleanup): Cleanup {
  let active = true
  return () => {
    if (!active) return
    active = false
    cleanup()
  }
}

function nativeAttachments(value: unknown, transfer: readonly Transferable[]) {
  const attachments: object[] = [...transfer]
  const known = new Set<object>(attachments)

  const visit = (entry: unknown) => {
    if (entry === null || typeof entry !== "object" || known.has(entry)) return
    known.add(entry)

    if (entry instanceof Blob) {
      attachments.push(entry)
      return
    }

    if (entry instanceof Date || entry instanceof RegExp || entry instanceof URL || entry instanceof Error || entry instanceof ArrayBuffer || ArrayBuffer.isView(entry)) return

    if (entry instanceof Map) {
      for (const [key, item] of entry) {
        visit(key)
        visit(item)
      }
      return
    }

    if (entry instanceof Set) {
      for (const item of entry) visit(item)
      return
    }

    for (const item of Array.isArray(entry) ? entry : Object.values(entry)) visit(item)
  }

  visit(value)
  return attachments
}

const wire = new Wire()
captureClientOutput(wire)
export default wire
