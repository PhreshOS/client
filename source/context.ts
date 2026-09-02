import type {
  ClientContext as CoreClientContext,
  ContextCapture as CoreContextCapture,
  ContextEvents as CoreContextEvents,
  ContextMessage as CoreContextMessage,
  EndpointLifecycle,
  ClientLaunch,
  ServerLaunch
} from "@phreshos/core"
import Deadline from "./deadline.js"
import {
  ClientEndpoint,
  ServerEndpoint,
  ServerTrafficHandle,
  TrafficHandle,
  bindEvents,
  endpointLifecycle,
  endpointEvents,
  process,
  program,
  visibleEndpoint,
  localWindow,
  window as windowHandle,
  type Endpoint,
  type EndpointReference,
  type Process,
  type ProcessRecord,
  type ProgramRecord,
  type ServerTraffic,
  type ClientTraffic,
} from "./domain.js"
import Events from "./events.js"
import wire from "./wire.js"
import { contextPermissions } from "./permissions.js"

/** The executing Process's canonical Server Endpoint handle. */
export type ContextServer<Events extends object = {}, Fallback = unknown> = ServerEndpoint<Events, Fallback>

/** One value addressed to the current Client Endpoint, with a client-visible sender. */
export type ContextMessage<Payload = unknown> = CoreContextMessage<Payload, Endpoint | null>

/** Applies the client-visible sender envelope to known Context events. */
export type ContextEvents<Events extends object> = CoreContextEvents<Events, Endpoint | null>

/** Every event observable through the current Client Endpoint Context. */
export type ContextCapture<Events extends object = {}> = CoreContextCapture<Events, Endpoint | null>

export type Context<Events extends object = {}> = CoreClientContext<Events>

const ServerEndpointBase = ServerEndpoint as unknown as new () => object
const ClientEndpointBase = ClientEndpoint as unknown as new () => object

class ContextServerHandle extends ServerEndpointBase {
  public readonly traffic = new ServerTrafficHandle(null, "server") as unknown as ServerTraffic
  public readonly lifecycle = endpointLifecycle(currentAddress, "server") as unknown as EndpointLifecycle

  public constructor(private readonly owner: () => Promise<Process>) {
    super()
    bindEvents(this, endpointEvents(null, "server"))
  }

  public process() { return this.owner() }
  public publish(event: string, payload: unknown = undefined) { wire.send("end-end", event, payload) }

  public async exists() {
    const answer = await wire.request(["exists", "server"]) as [boolean]
    return answer[0]
  }

  public async start(launch: ServerLaunch = {}) { await wire.request(["start-endpoint", undefined, "server", launch]) }
  public async stop() { await wire.request(["stop-endpoint", undefined, "server"]) }
  public async isService() { return (await wire.request(["is-service", "server"]) as [boolean])[0] }
  public async waitReady(timeout?: number) { await wire.request(["wait-ready", undefined, "server"], timeout) }

  public async ask<Answer = unknown>(event: string, payload: unknown = undefined) {
    return this.askWithin<Answer>(undefined, event, payload)
  }

  public timeout(milliseconds: number) {
    return { ask: <Answer = unknown>(event: string, payload: unknown = undefined) => this.askWithin<Answer>(milliseconds, event, payload) }
  }

  private async askWithin<Answer>(timeout: number | undefined, event: string, payload: unknown) {
    const deadline = new Deadline(timeout)
    await wire.requestWithin(["wait-ready", undefined, "server", true], deadline)
    return await wire.askServerWithin(event, payload, deadline) as Answer
  }
}

let ownerPromise: Promise<Process> | null = null
let contextServer!: ContextServer
let contextClient!: ClientEndpoint

function owner() {
  if (!ownerPromise) {
    const resolving = wire.request(["current-process"]).then(answer => {
      return process((answer as [ProcessRecord])[0], { server: contextServer, client: contextClient })
    })

    const retained = resolving.catch(error => {
      if (ownerPromise === retained) ownerPromise = null
      throw error
    })

    ownerPromise = retained
  }

  return ownerPromise
}

contextServer = new ContextServerHandle(owner) as unknown as ContextServer

class ContextClientHandle extends ClientEndpointBase {
  public readonly traffic = new TrafficHandle(null, "client") as unknown as ClientTraffic
  public readonly lifecycle = endpointLifecycle(currentAddress, "client") as unknown as EndpointLifecycle
  public readonly window = windowHandle(currentAddress)

  public constructor(private readonly owner: () => Promise<Process>) {
    super()
    bindEvents(this, endpointEvents(null, "client"))
  }

  public process() { return this.owner() }
  public publish(event: string, payload: unknown = undefined) {
    void wire.identity().then(identity => {
      wire.send("end-host", "send", { identity: identity.process, reference: identity.reference }, "client", event, payload)
    })
  }

  public async exists() {
    const answer = await wire.request(["exists", "client"]) as [boolean]
    return answer[0]
  }

  public async start(launch: ClientLaunch = {}) { await wire.request(["start-endpoint", undefined, "client", launch]) }
  public async stop() { await wire.request(["stop-endpoint", undefined, "client"]) }
  public async isService() { return (await wire.request(["is-service", "client"]) as [boolean])[0] }
  public async waitReady(timeout?: number) { await wire.request(["wait-ready", undefined, "client"], timeout) }
}

contextClient = new ContextClientHandle(owner) as unknown as ClientEndpoint

class ClientContext extends Events<ContextEvents<{}>, ContextMessage> implements Context {
  public readonly server = contextServer
  public readonly localWindow = localWindow(currentAddress)
  public readonly permissions = contextPermissions()

  public constructor() {
    super(
      (event, listener, impossible) => wire.on("end-end", event, value => listener(contextMessage(value)), null, impossible),
      (listener, impossible) => wire.onAll("end-end", (event, value) => {
        if (typeof event === "string") listener(event, contextMessage(value))
      }, null, impossible)
    )
  }

  public process() { return owner() }

  public async name() { return (await owner()).name }

  public async parent() {
    const answer = await wire.request(["parent"]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }

  public async program() {
    const answer = await wire.request(["current-program"]) as [ProgramRecord]
    return program(answer[0])
  }

  public async option(name: string) {
    const answer = await wire.request(["option", undefined, name]) as [string | undefined]
    return answer[0]
  }

  public async stop() { await wire.request(["stop-current"]) }
  public async isService() { return contextClient.isService() }
  public publish(event: string, payload: unknown = undefined) { wire.send("end-host", "emit", event, payload) }
}

async function currentAddress() {
  const identity = await wire.identity()
  return { identity: identity.process, reference: identity.reference }
}

function contextMessage(value: unknown): ContextMessage {
  const raw = value as { from?: EndpointReference | null, payload?: unknown }
  return { from: visibleEndpoint(raw.from), payload: raw.payload }
}

/** Inbound events, owner hierarchy, and paired Server Endpoint for this Client runtime. */
export const context: Context = new ClientContext()
