import {
  ClientService as CoreClientService,
  ServerService as CoreServerService,
  isServiceKey,
  type ClientService,
  type EndpointLifecycle,
  type ServerService,
  type Service,
  type ServiceKey
} from "@phreshos/core"
import Deadline from "./deadline.js"
import Events from "./events.js"
import HandleRegistry from "./handle-registry.js"
import wire from "./wire.js"

const handles = new HandleRegistry()
class ServiceHandle {
  public readonly lifecycle: EndpointLifecycle

  public constructor(protected readonly key: ServiceKey) {
    this.lifecycle = new Events(...serviceEvents(key, "lifecycle"))
  }

  public publish(event: string, payload: unknown = undefined) {
    wire.send("end-host", "service-send", this.key, event, payload)
  }

  public async exists() {
    const answer = await wire.request(["service-exists", this.key]) as [boolean]
    return answer[0]
  }

  public async waitReady(timeout?: number) {
    await wire.request(["service-wait-ready", this.key, timeout], timeout)
  }
}

class ServerHandler extends CoreServerService {
  public readonly subscribe: CoreServerService["subscribe"]
  public readonly wait: CoreServerService["wait"]
  public readonly events: CoreServerService["events"]
  public readonly lifecycle: EndpointLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly key: ServiceKey & { endpoint: "server" }) {
    super()
    this.service = new ServiceHandle(key)
    this.lifecycle = this.service.lifecycle
    const events = new Events(...serviceEvents(key, "events"))
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public readonly publish = (event: string, payload: unknown = undefined) => { this.service.publish(event, payload) }
  public exists() { return this.service.exists() }

  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }

  public async ask<Answer = unknown>(event: string, payload: unknown = undefined) {
    return await this.askWithin<Answer>(new Deadline(), event, payload)
  }

  public timeout(milliseconds: number) {
    return { ask: <Answer = unknown>(event: string, payload: unknown = undefined) => (
      this.askWithin<Answer>(new Deadline(milliseconds), event, payload)
    ) }
  }

  private async askWithin<Answer>(deadline: Deadline, event: string, payload: unknown) {
    const identity = await wire.identity()
    const address = `client:${identity.process}:${crypto.randomUUID()}`
    const question = crypto.randomUUID()
    const waiting = wire.expectWithin(address, deadline)

    wire.send("end-host", "service-ask", this.key, address, question, event, payload)

    try { return await waiting as Answer }
    finally { wire.forget(address) }
  }
}

class ClientHandler extends CoreClientService {
  public readonly subscribe: CoreClientService["subscribe"]
  public readonly wait: CoreClientService["wait"]
  public readonly events: CoreClientService["events"]
  public readonly lifecycle: EndpointLifecycle
  private readonly service: ServiceHandle

  public constructor(key: ServiceKey & { endpoint: "client" }) {
    super()
    this.service = new ServiceHandle(key)
    this.lifecycle = this.service.lifecycle
    const events = new Events(...serviceEvents(key, "events"))
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public readonly publish = (event: string, payload: unknown = undefined) => { this.service.publish(event, payload) }
  public exists() { return this.service.exists() }
  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }
}

export function prepareService<EventsMap extends object = {}, Fallback = unknown>(key: ServiceKey & { endpoint: "server" }): ServerService<EventsMap, Fallback>
export function prepareService<EventsMap extends object = {}, Fallback = unknown>(key: ServiceKey & { endpoint: "client" }): ClientService<EventsMap, Fallback>
export function prepareService(key: ServiceKey): Service
export function prepareService(key: ServiceKey): Service {
  if (!isServiceKey(key)) throw new Error("A complete service key is required")

  const address = Object.freeze({
    ...(key.program === undefined ? {} : { program: key.program }),
    process: key.process
  })
  const identity = JSON.stringify([key.program ?? null, key.process, key.endpoint])

  if (key.endpoint === "server") {
    const normalized = Object.freeze({ ...address, endpoint: "server" as const })
    return handles.obtain<Service>(`service:${identity}`, () => new ServerHandler(normalized))
  }

  const normalized = Object.freeze({ ...address, endpoint: "client" as const })
  return handles.obtain<Service>(`service:${identity}`, () => new ClientHandler(normalized))
}

function serviceEvents(key: ServiceKey, scope: "lifecycle" | "events") {
  return [
    (event: string, listener: (message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(key, scope, event, listener, impossible),
    (listener: (event: string, message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(key, scope, null, (event, payload) => {
      if (typeof event === "string") listener(event, payload)
    }, impossible)
  ] as const satisfies ConstructorParameters<typeof Events>
}
