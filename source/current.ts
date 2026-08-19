import type { LaunchClient, LocalWindow, Position, Size, SurfaceSettings, Transaction, WindowGeometry, WindowState } from "@phreshos/core"
import { channel, type Channel } from "./channel.js"
import Deadline from "./deadline.js"
import {
  Client,
  Server,
  ServerTrafficHandle,
  TrafficHandle,
  bindEvents,
  endpointEvents,
  process,
  program,
  window as windowHandle,
  type Process,
  type ProcessRecord,
  type Program,
  type ProgramRecord,
  type ServerTraffic,
  type ClientTraffic,
  type Window
} from "./domain.js"
import wire from "./wire.js"
import { endpointService } from "./service.js"
import { currentProgramPermissions } from "./permissions.js"

/** The current Process's canonical Server handle. */
export type CurrentServer<Events extends object = {}> = Server<Events>

/** Current Client context: its inbound Channel, owner hierarchy, and paired Server. */
export interface Current<Events extends object = {}> extends Channel<Events>, Pick<Client, "service"> {
  /** The same Server handle exposed by the current Process. */
  readonly server: CurrentServer

  /** Presentation capability of this current Client. */
  readonly window: Window

  /** Physical Window representation belonging only to this Client iframe. */
  readonly localWindow: LocalWindow

  /** The same permission capability exposed by the current Program. */
  readonly permissions: Program["permissions"]

  /** Returns the Process represented by this Client. */
  process(): Promise<Process>

  /** Returns the accessible parent Process, or `null` when none exists. */
  parent(): Promise<Process | null>

  /** Returns the Program that owns this Client. */
  program(): Promise<Program>

  /** Returns one immutable option supplied when this Process was created. */
  option(name: string): Promise<string | undefined>

  /** Stops the current Client; rejects when it is the final live Endpoint. */
  stop(): Promise<void>

}

const ServerBase = Server as unknown as new () => object
const ClientBase = Client as unknown as new () => object

class CurrentServerHandle extends ServerBase {
  public readonly traffic = new ServerTrafficHandle(null, "server") as unknown as ServerTraffic

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

  public async start() { await wire.request(["start-endpoint", undefined, "server"]) }
  public async stop() { await wire.request(["stop-endpoint", undefined, "server"]) }
  public service<ServiceEvents extends object = {}>() { return endpointService<ServiceEvents>(null, "server") }
  public async waitReady(timeout?: number) { await wire.request(["wait-ready"], timeout) }

  public async ask<Answer = unknown>(event: string, payload: unknown = undefined) {
    return this.askWithin<Answer>(undefined, event, payload)
  }

  public timeout(milliseconds: number) {
    return { ask: <Answer = unknown>(event: string, payload: unknown = undefined) => this.askWithin<Answer>(milliseconds, event, payload) }
  }

  private async askWithin<Answer>(timeout: number | undefined, event: string, payload: unknown) {
    const deadline = new Deadline(timeout)
    await wire.requestWithin(["wait-ready", null, true], deadline)
    return await wire.askServerWithin(event, payload, deadline) as Answer
  }
}

let ownerPromise: Promise<Process> | null = null
let currentServer!: CurrentServer
let currentClient!: Client

function owner() {
  if (!ownerPromise) {
    const resolving = wire.request(["process"]).then(answer => {
      return process((answer as [ProcessRecord])[0], { server: currentServer, client: currentClient })
    })

    const retained = resolving.catch(error => {
      if (ownerPromise === retained) ownerPromise = null
      throw error
    })

    ownerPromise = retained
  }

  return ownerPromise
}

currentServer = new CurrentServerHandle(owner) as unknown as CurrentServer

class CurrentClientHandle extends ClientBase {
  public readonly traffic = new TrafficHandle(null, "client") as unknown as ClientTraffic
  public readonly window = windowHandle(async () => {
    const identity = await wire.identity()
    return { identity: identity.process, reference: identity.reference }
  })

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

  public async start(overrides: LaunchClient = {}) { await wire.request(["start-endpoint", undefined, "client", overrides]) }
  public async stop() { await wire.request(["stop-endpoint", undefined, "client"]) }
  public service<ServiceEvents extends object = {}>() { return endpointService<ServiceEvents>(null, "client") }
}

currentClient = new CurrentClientHandle(owner) as unknown as Client

class ClientCurrent {
  public readonly server = currentServer
  public readonly window = currentClient.window
  public readonly localWindow = new LocalWindowHandle()
  public readonly permissions = currentProgramPermissions

  public constructor() {
    bindChannel(this, channel)
  }

  public process() { return owner() }

  public async parent() {
    const answer = await wire.request(["parent"]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }

  public async program() {
    const answer = await wire.request(["program"]) as [ProgramRecord]
    return program(answer[0])
  }

  public async option(name: string) {
    const answer = await wire.request(["option", undefined, name]) as [string | undefined]
    return answer[0]
  }

  public async stop() { await wire.request(["stop-current"]) }
  public service<ServiceEvents extends object = {}>() { return endpointService<ServiceEvents>(null, "client") }
}

class LocalWindowHandle implements LocalWindow {
  public readonly surface = new LocalWindowSurfaceHandle()

  private async state() {
    const answer = await wire.request(["localWindow"]) as [WindowState]
    return answer[0]
  }

  public async title() { return (await this.state()).title }
  public async position() { return (await this.state()).position }
  public async size() { return (await this.state()).size }
  public async minimized() { return (await this.state()).minimized }
  public async front() { return (await this.state()).front }
  public async layer() { return (await this.state()).layer }
  public async location() { return (await this.state()).location }
  public async move(position: Position, transaction?: Transaction) { await wire.request(["localWindowMove", position, transaction]) }
  public async resize(size: Size, transaction?: Transaction) { await wire.request(["localWindowResize", size, transaction]) }
  public async setGeometry(geometry: WindowGeometry, transaction?: Transaction) { await wire.request(["localWindowGeometry", geometry, transaction]) }
  public async minimize(minimized = true) { await wire.request(["localWindowMinimize", minimized]) }
  public async changeTitle(title: string) { await wire.request(["localWindowTitle", title]) }
  public async raise() { await wire.request(["localWindowRaise"]) }
}

class LocalWindowSurfaceHandle {
  public async set(settings: SurfaceSettings = {}, transaction?: Transaction) { await wire.request(["localWindowSurfaceSet", settings, transaction]) }
  public async remove() { await wire.request(["localWindowSurfaceRemove"]) }
}

function bindChannel(target: object, source: Channel) {
  Object.assign(target, {
    publish: source.publish.bind(source),
    subscribe: source.subscribe.bind(source),
    waitFor: source.waitFor.bind(source),
    events: source.events.bind(source),
    observe: source.observe.bind(source),
    enableService: source.enableService.bind(source),
    disableService: source.disableService.bind(source)
  })
}

/** Inbound events, owner hierarchy, and paired Server for the current Client. */
export const current = new ClientCurrent() as unknown as Current
