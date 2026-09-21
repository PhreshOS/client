import {
  ClientService as CoreClientService,
  ServerService as CoreServerService,
  isServiceAddress,
  type ClientService,
  type ServerService,
  type ServiceAddress,
  type ServiceLifecycle,
  type ServiceProgramMetadata,
  type ProgramIconSize
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

  public async programMetadata() {
    const [value] = await wire.request(["service-program-metadata", this.serviceAddress]) as [unknown]
    return parseServiceProgramMetadata(value)
  }

  public async programIcon(size: ProgramIconSize = "medium") {
    const [value] = await wire.request(["service-program-icon", this.serviceAddress, size]) as [unknown]
    return parseServiceProgramIcon(value)
  }
}

class ServerHandler extends CoreServerService {
  public readonly subscribe: CoreServerService["subscribe"]
  public readonly wait: CoreServerService["wait"]
  public readonly events: CoreServerService["events"]
  public readonly lifecycle: ServiceLifecycle
  private readonly service: ServiceHandle

  public constructor(private readonly serviceAddress: ServiceAddress<"server">) {
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
  public programMetadata() { return this.service.programMetadata() }
  public programIcon(size?: ProgramIconSize) { return this.service.programIcon(size) }

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

  public constructor(private readonly serviceAddress: ServiceAddress<"client">) {
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
  public programMetadata() { return this.service.programMetadata() }
  public programIcon(size?: ProgramIconSize) { return this.service.programIcon(size) }
  public waitReady(timeout?: number) { return this.service.waitReady(timeout) }
}

export function prepareService<EventsMap extends object = {}, Fallback = unknown>(address: ServiceAddress<"server">): ServerService<EventsMap, Fallback>
export function prepareService<EventsMap extends object = {}, Fallback = unknown>(address: ServiceAddress<"client">): ClientService<EventsMap, Fallback>
export function prepareService(address: ServiceAddress): ServerService | ClientService
export function prepareService(address: ServiceAddress): ServerService | ClientService {
  if (!isServiceAddress(address)) throw new Error("A complete Service address is required")

  const identity = JSON.stringify([address.program, address.process, address.endpoint])

  if (address.endpoint === "server") {
    const normalized = Object.freeze({ program: address.program, process: address.process, endpoint: "server" as const })
    return handles.obtain<ServerService>(`service:${identity}`, () => new ServerHandler(normalized))
  }

  const normalized = Object.freeze({ program: address.program, process: address.process, endpoint: "client" as const })
  return handles.obtain<ClientService>(`service:${identity}`, () => new ClientHandler(normalized))
}

function serviceEvents(address: ServiceAddress, scope: "lifecycle" | "events") {
  return [
    (event: string, listener: (message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(address, scope, event, listener, impossible),
    (listener: (event: string, message: unknown) => unknown, impossible?: (error: Error) => void) => wire.followService(address, scope, null, (event, payload) => {
      if (typeof event === "string") listener(event, payload)
    }, impossible)
  ] as const satisfies ConstructorParameters<typeof Events>
}

function parseServiceProgramMetadata(value: unknown): ServiceProgramMetadata {
  if (!value || typeof value !== "object") throw new Error("The System returned invalid Service Program metadata")

  const metadata = value as { name?: unknown, version?: unknown }

  if (typeof metadata.name !== "string" || typeof metadata.version !== "string") {
    throw new Error("The System returned invalid Service Program metadata")
  }

  return Object.freeze({ name: metadata.name, version: metadata.version })
}

function parseServiceProgramIcon(value: unknown) {
  if (!Array.isArray(value) || value.some(byte => typeof byte !== "number")) {
    throw new Error("The System returned an invalid Service Program icon")
  }
  return new Blob([Uint8Array.from(value)], { type: "image/png" })
}
