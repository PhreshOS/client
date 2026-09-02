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
const ServerServiceBase = CoreServerService as unknown as new () => object
const ClientServiceBase = CoreClientService as unknown as new () => object

class ServiceHandle {
  public readonly lifecycle: EndpointLifecycle

  public constructor(protected readonly key: ServiceKey) {
    this.lifecycle = new Events(...serviceEvents(key, "lifecycle")) as unknown as EndpointLifecycle
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

class ServerHandler extends ServerServiceBase {
  public readonly lifecycle: EndpointLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly key: ServiceKey & { endpoint: "server" }) {
    super()
    this.service = new ServiceHandle(key)
    this.lifecycle = this.service.lifecycle
    bindEvents(this, new Events(...serviceEvents(key, "events")))
  }

  public publish(event: string, payload: unknown = undefined) { this.service.publish(event, payload) }
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

class ClientHandler extends ClientServiceBase {
  public readonly lifecycle: EndpointLifecycle
  private readonly service: ServiceHandle

  public constructor(key: ServiceKey & { endpoint: "client" }) {
    super()
    this.service = new ServiceHandle(key)
    this.lifecycle = this.service.lifecycle
    bindEvents(this, new Events(...serviceEvents(key, "events")))
  }

  public publish(event: string, payload: unknown = undefined) { this.service.publish(event, payload) }
  public exists() { return this.service.exists() }
  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }
}

export function prepareService<EventsMap extends object = {}, Fallback = unknown>(key: ServiceKey & { endpoint: "server" }): ServerService<EventsMap, Fallback>
export function prepareService<EventsMap extends object = {}, Fallback = unknown>(key: ServiceKey & { endpoint: "client" }): ClientService<EventsMap, Fallback>
export function prepareService(key: ServiceKey): Service
export function prepareService(key: ServiceKey): unknown {
  if (!isServiceKey(key)) throw new Error("A complete service key is required")

  const normalized = Object.freeze({
    ...(key.program === undefined ? {} : { program: key.program }),
    process: key.process,
    endpoint: key.endpoint
  })
  const identity = JSON.stringify([key.program ?? null, key.process, key.endpoint])

  return handles.obtain(`service:${identity}`, () => normalized.endpoint === "server"
    ? new ServerHandler(normalized as ServiceKey & { endpoint: "server" })
    : new ClientHandler(normalized as ServiceKey & { endpoint: "client" })) as unknown as Service
}

function serviceEvents(key: ServiceKey, scope: "lifecycle" | "events") {
  return [
    (event: string, listener: (message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(key, scope, event, listener, impossible),
    (listener: (event: string, message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(key, scope, null, (event, payload) => {
      if (typeof event === "string") listener(event, payload)
    }, impossible)
  ] as const satisfies ConstructorParameters<typeof Events>
}

function bindEvents(target: object, events: Events) {
  Object.assign(target, {
    subscribe: events.subscribe.bind(events),
    waitFor: events.waitFor.bind(events),
    events: events.events.bind(events)
  })
}
