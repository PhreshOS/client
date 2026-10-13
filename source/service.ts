import {
  ClientService as CoreClientService,
  ServerService as CoreServerService,
  Service as CoreService,
  isServiceAddress,
  type ClientService,
  type ServerService,
  type Service,
  type ServiceAddress,
  type ServiceLifecycle
} from "@phreshos/core"
import Deadline from "./deadline.js"
import Events from "./events.js"
import HandleRegistry from "./handle-registry.js"
import wire from "./wire.js"

const handles = new HandleRegistry()
class ServiceHandle {
  public readonly lifecycle: ServiceLifecycle

  public constructor(protected readonly serviceAddress: ServiceAddress) {
    this.lifecycle = new Events(...serviceEvents(serviceAddress, "lifecycle"))
  }

  public publish(event: string, payload: unknown = undefined) {
    wire.send("end-host", "service-send", this.serviceAddress, event, payload)
  }

  public address() { return this.serviceAddress }

  public async available() {
    const answer = await wire.request(["service-available", this.serviceAddress]) as [boolean]
    return answer[0]
  }

  public async waitReady(timeout?: number) {
    await wire.request(["service-wait-ready", this.serviceAddress, timeout], timeout)
  }
}

class ServerHandler extends CoreServerService {
  public readonly subscribe: CoreServerService["subscribe"]
  public readonly wait: CoreServerService["wait"]
  public readonly events: CoreServerService["events"]
  public readonly lifecycle: ServiceLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly serviceAddress: ServiceAddress<"server"> & Readonly<{ endpoint: "server" }>) {
    super()
    this.service = new ServiceHandle(serviceAddress)
    this.lifecycle = this.service.lifecycle
    const events = new Events(...serviceEvents(serviceAddress, "events"))
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public readonly publish = (event: string, payload: unknown = undefined) => { this.service.publish(event, payload) }
  public address() { return this.serviceAddress }
  public available() { return this.service.available() }

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

    wire.send("end-host", "service-ask", this.serviceAddress, address, question, event, payload)

    try { return await waiting as Answer }
    finally { wire.forget(address) }
  }
}

class ClientHandler extends CoreClientService {
  public readonly subscribe: CoreClientService["subscribe"]
  public readonly wait: CoreClientService["wait"]
  public readonly events: CoreClientService["events"]
  public readonly lifecycle: ServiceLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly serviceAddress: ServiceAddress<"client"> & Readonly<{ endpoint: "client" }>) {
    super()
    this.service = new ServiceHandle(serviceAddress)
    this.lifecycle = this.service.lifecycle
    const events = new Events(...serviceEvents(serviceAddress, "events"))
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public readonly publish = (event: string, payload: unknown = undefined) => { this.service.publish(event, payload) }
  public address() { return this.serviceAddress }
  public available() { return this.service.available() }
  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }
}

/** Whichever Endpoint holds a Service name, for what both kinds share. */
class AnyHandler extends CoreService {
  public readonly subscribe: CoreService["subscribe"]
  public readonly wait: CoreService["wait"]
  public readonly events: CoreService["events"]
  public readonly lifecycle: ServiceLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly serviceAddress: ServiceAddress) {
    super()
    this.service = new ServiceHandle(serviceAddress)
    this.lifecycle = this.service.lifecycle
    const events = new Events(...serviceEvents(serviceAddress, "events"))
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public readonly publish = (event: string, payload: unknown = undefined) => { this.service.publish(event, payload) }
  public address() { return this.serviceAddress }
  public available() { return this.service.available() }
  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }
}

/**
 * The handle to a Service name, the same one for the same address: the Server holding it, the Client
 * holding it, or whichever Endpoint holds it when no kind is named. It reaches the System only when used.
 */
export function serviceHandle(address: ServiceAddress): Service {
  if (!isServiceAddress(address)) throw new Error("A Service is reached by its name, such as file-picker-v1, and optionally the kind of Endpoint")

  const { name, endpoint } = address
  const key = `service:${name}:${endpoint ?? "any"}`

  if (endpoint === "server") return handles.obtain<ServerService>(key, () => new ServerHandler(Object.freeze({ name, endpoint })))
  if (endpoint === "client") return handles.obtain<ClientService>(key, () => new ClientHandler(Object.freeze({ name, endpoint })))
  return handles.obtain<Service>(key, () => new AnyHandler(Object.freeze({ name })))
}

function serviceEvents(address: ServiceAddress, scope: "lifecycle" | "events") {
  return [
    (event: string, listener: (message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(address, scope, event, listener, impossible),
    (listener: (event: string, message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(address, scope, null, (event, payload) => {
      if (typeof event === "string") listener(event, payload)
    }, impossible)
  ] as const satisfies ConstructorParameters<typeof Events>
}
