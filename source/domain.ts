import {
  ClientEndpoint as CoreClientEndpoint,
  Endpoint as CoreEndpoint,
  Process as CoreProcess,
  Program as CoreProgram,
  ServerEndpoint as CoreServerEndpoint,
  parseEndpointReference,
  parseProcessSnapshot,
  parseProgramSnapshot,
  type AnswerCapture as CoreAnswerCapture,
  type AnswerMessage as CoreAnswerMessage,
  type AnswerOutcome,
  type AppearanceTransaction,
  type AnswerSubscriber as CoreAnswerSubscriber,
  type AskCapture as CoreAskCapture,
  type AskMessage as CoreAskMessage,
  type AskSubscriber as CoreAskSubscriber,
  type Cleanup,
  type ClientTraffic as CoreClientTraffic,
  type ClientDeclaration,
  type EndpointReference as CoreEndpointReference,
  type EndpointSnapshot,
  type HandleAddress,
  type ProcessSnapshot,
  type ProgramSnapshot,
  type EndpointTraffic as CoreEndpointTraffic,
  type EndpointLifecycle,
  type EndpointLifecycleEvents,
  type EndpointDeclaration,
  type Exit,
  type EventOptions,
  type Launch,
  type ClientLaunch,
  type ServerLaunch,
  type LocalWindow,
  type LocalWindowOperations,
  type Position,
  type ProgramCommandChunk,
  type ProgramInstallOptions,
  type ProgramUninstallOptions,
  type ProgramIconSize,
  type ProgramEvents,
  type ProgramProcess as CoreProgramProcess,
  type ProgramProcessEvents,
  type ProgramProcessRunEvent as CoreProgramProcessRunEvent,
  type ProgramProcessRunOptions as CoreProgramProcessRunOptions,
  type ServerTraffic as CoreServerTraffic,
  type Size,
  type Storage,
  type TrafficMessage as CoreTrafficMessage,
  type TrafficCapture as CoreTrafficCapture,
  type TrafficEvents as CoreTrafficEvents,
  type Window as CoreWindow,
  type WindowGeometry,
  type WindowEvents,
  type WindowState,
  type ProcessEvents,
  type WaitedTransaction
} from "@phreshos/core"
import Events, { stream } from "./events.js"
import Deadline from "./deadline.js"
import HandleRegistry from "./handle-registry.js"
import { area, sql, store } from "./storage.js"
import startup from "./startup.js"
import launch from "./launch.js"
import { programPermissions } from "./permissions.js"
import wire from "./wire.js"

export type { HandleAddress }
export type EndpointDeclarationRecord = EndpointDeclaration
export type ClientDeclarationRecord = ClientDeclaration
export type ProgramRecord = ProgramSnapshot
export type ProcessRecord = ProcessSnapshot
export type EndpointRecord = EndpointSnapshot
export type EndpointReference = CoreEndpointReference

export type WindowRecord = WindowState

export type Program = CoreProgram
export type ProgramProcess = CoreProgramProcess
export type ProgramProcessRunEvent = CoreProgramProcessRunEvent
export type ProgramProcessRunOptions = CoreProgramProcessRunOptions
export type Process = CoreProcess

/** Traffic value resolved to the same global Endpoint handles as the System. */
export type TrafficMessage<Payload = unknown> = CoreTrafficMessage<Payload, Endpoint | null>

/** Applies client-visible destination metadata to known traffic events. */
export type TrafficEvents<Events extends object> = CoreTrafficEvents<Events, Endpoint | null>

/** Every ordinary event observable in client-visible Endpoint traffic. */
export type TrafficCapture<Events extends object = {}, Fallback = unknown> = CoreTrafficCapture<Events, Endpoint | null, Fallback>

/** Question carrying its globally resolved Server Endpoint destination. */
export type AskMessage<Payload = unknown> = CoreAskMessage<Payload, ServerEndpoint | null>

/** One question observable in client-visible Endpoint traffic. */
export type AskCapture<Payload = unknown> = CoreAskCapture<Payload, ServerEndpoint | null>

/** Callback that observes questions sent by a client-visible Endpoint. */
export type AskSubscriber<Payload = unknown> = CoreAskSubscriber<Payload, ServerEndpoint | null>

/** Answer carrying its globally resolved Endpoint destination. */
export type AnswerMessage<Result = unknown> = CoreAnswerMessage<Result, Endpoint | null>

/** One answer observable in client-visible Server Endpoint traffic. */
export type AnswerCapture<Result = unknown> = CoreAnswerCapture<Result, Endpoint | null>

/** Callback that observes answers sent by a client-visible Server Endpoint. */
export type AnswerSubscriber<Result = unknown> = CoreAnswerSubscriber<Result, Endpoint | null>

/** Directed communication originating from one client-visible Endpoint. */
export type EndpointTraffic<Events extends object = {}, Fallback = unknown> = CoreEndpointTraffic<Events, Endpoint | null, ServerEndpoint | null, Fallback>

/** Directed communication originating from one client-visible Server Endpoint. */
export type ServerTraffic<Events extends object = {}, Fallback = unknown> = CoreServerTraffic<Events, Endpoint | null, ServerEndpoint | null, Fallback>

/** Directed communication originating from one client-visible Client Endpoint. */
export type ClientTraffic<Events extends object = {}, Fallback = unknown> = CoreClientTraffic<Events, Endpoint | null, ServerEndpoint | null, Fallback>

export type Endpoint<Events extends object = {}, Fallback = unknown> = CoreEndpoint<Events, Fallback>
export type ServerEndpoint<Events extends object = {}, Fallback = unknown> = CoreServerEndpoint<Events, Fallback>
export type ClientEndpoint<Events extends object = {}, Fallback = unknown> = CoreClientEndpoint<Events, Fallback>
export type Window = CoreWindow

const handles = new HandleRegistry()

class ProgramHandle extends CoreProgram {
  public readonly subscribe: CoreProgram["subscribe"]
  public readonly wait: CoreProgram["wait"]
  public readonly events: CoreProgram["events"]
  public readonly identity: string
  public readonly reference: string
  public readonly data: Storage
  public readonly cache: Storage
  public readonly store
  public readonly logs
  public readonly database
  public readonly startup
  public readonly launch
  public readonly process: ProgramProcess
  public readonly permissions
  private record: ProgramRecord

  public constructor(record: ProgramRecord) {
    super()
    this.identity = record.identity
    this.reference = record.reference
    this.record = record
    this.data = area(this.address, "data")
    this.cache = area(this.address, "cache")
    this.store = store(this.address)
    this.logs = sql("logs", this.address)
    this.database = sql("database", this.address)
    this.startup = startup(this.address)
    this.launch = launch(this.address)
    this.permissions = programPermissions(this.address)
    this.process = new ProgramProcessHandle(this.address, record.reference)

    const events = scoped<ProgramEvents, never>("program-host", record.reference, programEvent)
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public get name() { return this.record.name }
  public get assetId() { return this.record.assetId }
  public get version() { return this.record.version }
  public get description() { return this.record.description }
  public get hasAgent() { return this.record.hasAgent }
  public get server() { return this.record.server }
  public get client() { return this.record.client }
  public get address(): HandleAddress { return { identity: this.identity, reference: this.reference } }

  public update(record: ProgramRecord) {
    if (record.reference !== this.reference) throw new Error("A Program handle cannot become another Program")
    this.record = record
  }

  public async icon(size: ProgramIconSize = "medium") {
    const answer = await wire.request(["icon", this.address, size]) as [number[]]
    return new Blob([Uint8Array.from(answer[0])], { type: "image/png" })
  }

  public async agent() {
    if (!this.hasAgent) return null
    const answer = await wire.request(["program-agent", this.address]) as [string | null]
    return answer[0]
  }

  public async installed() {
    const answer = await wire.request(["installed", this.address]) as [boolean]
    return answer[0]
  }

  public async *install(options: ProgramInstallOptions = {}) {
    for await (const value of wire.stream(["install", this.address, options])) {
      yield programCommandChunk(value)
    }
  }

  public async *uninstall(options: ProgramUninstallOptions = {}) {
    for await (const value of wire.stream(["uninstall", this.address, options])) {
      yield programCommandChunk(value)
    }
  }
  public async forget() { await wire.request(["forget", this.address]) }
}

function programCommandChunk(value: unknown): ProgramCommandChunk {
  const chunk = value as Partial<ProgramCommandChunk> | null

  if (!chunk || (chunk.stream !== "stdout" && chunk.stream !== "stderr") || typeof chunk.text !== "string") {
    throw new Error("The desktop returned an invalid Program command chunk")
  }

  return Object.freeze({ stream: chunk.stream, text: chunk.text })
}

class ProgramProcessHandle implements CoreProgramProcess {
  public readonly subscribe: CoreProgramProcess["subscribe"]
  public readonly wait: CoreProgramProcess["wait"]
  public readonly events: CoreProgramProcess["events"]

  public constructor(private readonly address: HandleAddress, reference: string) {
    const events = scoped<ProgramProcessEvents, never>("program-process", reference, programProcessEvent)
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public async list() {
    const answer = await wire.request(["program-process-list", this.address]) as [ProcessRecord[]]
    return answer[0].map(record => process(record))
  }

  public async first() {
    return chronological(await this.list())[0] ?? null
  }

  public async last() {
    return chronological(await this.list()).at(-1) ?? null
  }

  public async find(identityOrName: string) {
    const answer = await wire.request(["program-process-find", this.address, identityOrName]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }

  public async create(launch: Launch = {}) {
    const answer = await wire.request(["program-process-create", this.address, launch]) as [ProcessRecord]
    return process(answer[0])
  }

  public async *run(launch: Launch = {}, options: ProgramProcessRunOptions = {}) {
    for await (const value of wire.stream(["run", this.address, launch], undefined, options.signal)) {
      yield processRunEvent(value)
    }
  }

  public async findOrCreate(launch: Launch & Readonly<{ name: string }>) {
    const answer = await wire.request(["program-process-find-or-create", this.address, launch]) as [ProcessRecord]
    return process(answer[0])
  }

  public async exitAll() {
    const answer = await wire.request(["program-process-exit-all", this.address]) as [string[]]
    return answer[0]
  }
}

function processRunEvent(value: unknown): ProgramProcessRunEvent {
  const event = value as {
    event?: unknown
    process?: ProcessRecord
    stream?: unknown
    text?: unknown
    exit?: { code?: unknown, signal?: unknown }
  } | null

  if (event?.event === "started" && event.process) {
    return Object.freeze({ event: "started", process: process(event.process) })
  }

  if (event?.event === "output" && (event.stream === "stdout" || event.stream === "stderr") && typeof event.text === "string") {
    return Object.freeze({ event: "output", stream: event.stream, text: event.text })
  }

  if (event?.event === "exited" && event.process) {
    const code = typeof event.exit?.code === "number" ? event.exit.code : null
    const signal = typeof event.exit?.signal === "string" ? event.exit.signal : null
    return Object.freeze({ event: "exited", process: process(event.process), exit: exit(code, signal) })
  }

  throw new Error("The System returned an invalid Process run event")
}

function chronological(processes: Process[]) {
  return processes.sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())
}

class ProcessHandle extends CoreProcess {
  public readonly subscribe: CoreProcess["subscribe"]
  public readonly wait: CoreProcess["wait"]
  public readonly events: CoreProcess["events"]
  public readonly identity: string
  public readonly reference: string
  public readonly name: string | null
  public readonly startedAt: Date
  public readonly server: ServerEndpoint
  public readonly client: ClientEndpoint
  private readonly ownerProgram: Program
  private readonly launchOptions: Readonly<Record<string, string>>

  public constructor(record: ProcessRecord, endpoints: { server?: ServerEndpoint, client?: ClientEndpoint } = {}) {
    super()
    this.identity = record.identity
    this.reference = record.reference
    this.name = record.name
    this.startedAt = new Date(record.startedAt)
    this.ownerProgram = program(record.program)
    this.launchOptions = Object.freeze({ ...record.options })
    this.server = endpointHandle(this, "server", endpoints.server) as ServerEndpoint
    this.client = endpointHandle(this, "client", endpoints.client) as ClientEndpoint
    const events = scoped<ProcessEvents, never>("process-host", record.reference, processEvent)
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public program() { return this.ownerProgram }
  public get address(): HandleAddress { return { identity: this.identity, reference: this.reference } }

  public async parent() {
    const answer = await wire.request(["parent", this.address]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }

  public options<Options extends object = Readonly<Record<string, string>>>(): Promise<Readonly<Options>>
  public options<Option extends string = string>(name: string): Promise<Option | undefined>
  public async options(name?: string) {
    return name === undefined ? this.launchOptions : this.launchOptions[name]
  }

  public async exit() { await wire.request(["exit", this.address]) }

  public async exited() {
    const answer = await wire.request(["exited", this.address]) as [boolean]
    return answer[0]
  }
}

export class TrafficHandle<EventsMap extends object = {}, Fallback = unknown>
  extends Events<TrafficEvents<EventsMap>, TrafficMessage<Fallback>> {
  public constructor(protected readonly target: HandleAddress | null, protected readonly kind: "server" | "client") {
    super(
      (event, listener, impossible) => wire.observe(target, kind, "publish", event, value => listener(trafficMessage(value)), impossible),
      (listener, impossible) => wire.observe(target, kind, "publish", null, (event, value) => {
        if (typeof event === "string") listener(event, trafficMessage(value))
      }, impossible)
    )
  }

  public subscribeAsks<Payload = unknown>(subscriber: (capture: AskCapture<Payload>) => unknown): Cleanup {
    return this.followAsks(subscriber)
  }

  public asks<Payload = unknown>(options?: EventOptions) {
    return stream<AskCapture<Payload>>((subscriber, impossible) => this.followAsks(subscriber, impossible), options)
  }

  private followAsks<Payload>(subscriber: (capture: AskCapture<Payload>) => unknown, impossible?: (error: Error) => void): Cleanup {
    return wire.observe(this.target, this.kind, "ask", null, (event, questionId, value) => {
      if (typeof event !== "string" || typeof questionId !== "string") return
      subscriber({ event, questionId, message: trafficMessage(value) as AskCapture<Payload>["message"] })
    }, impossible)
  }
}

export class ServerTrafficHandle<EventsMap extends object = {}, Fallback = unknown>
  extends TrafficHandle<EventsMap, Fallback> {
  public subscribeAnswers<Result = unknown>(subscriber: (capture: AnswerCapture<Result>) => unknown): Cleanup {
    return this.followAnswers(subscriber)
  }

  public answers<Result = unknown>(options?: EventOptions) {
    return stream<AnswerCapture<Result>>((subscriber, impossible) => this.followAnswers(subscriber, impossible), options)
  }

  private followAnswers<Result>(subscriber: (capture: AnswerCapture<Result>) => unknown, impossible?: (error: Error) => void): Cleanup {
    return wire.observe(this.target, "server", "answer", null, (event, questionId, value) => {
      if (typeof event !== "string" || typeof questionId !== "string") return
      const raw = value as { to?: EndpointReference | null, outcome?: AnswerOutcome }
      subscriber({ event, questionId, message: { to: visibleEndpoint(raw.to), outcome: raw.outcome as AnswerOutcome<Result> } })
    }, impossible)
  }
}

class ServerEndpointHandle extends CoreServerEndpoint {
  public readonly subscribe: CoreServerEndpoint["subscribe"]
  public readonly wait: CoreServerEndpoint["wait"]
  public readonly events: CoreServerEndpoint["events"]
  public readonly traffic: ServerTrafficHandle
  public readonly lifecycle: EndpointLifecycle

  public constructor(private readonly owner: ProcessHandle) {
    super()
    this.traffic = new ServerTrafficHandle(owner.address, "server")
    this.lifecycle = endpointLifecycle(() => Promise.resolve(owner.address), "server")
    const events = endpointEvents(owner.address, "server")
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public async process() { return this.owner }
  public readonly publish: CoreServerEndpoint["publish"] = (event: string, payload: unknown = undefined) => {
    wire.send("end-host", "send", this.owner.address, "server", event, payload)
  }

  public async exists() {
    const answer = await wire.request(["exists", "server", this.owner.address]) as [boolean]
    return answer[0]
  }

  public async start(launch: ServerLaunch = {}) { await wire.request(["start-endpoint", this.owner.address, "server", launch]) }
  public async stop() { await wire.request(["stop-endpoint", this.owner.address, "server"]) }
  public async isService() { return (await wire.request(["is-service", "server", this.owner.address]) as [boolean])[0] }
  public async waitReady(timeout?: number) { await wire.request(["wait-ready", this.owner.address, "server"], timeout) }

  public async ask<Answer = unknown>(event: string, payload: unknown = undefined) {
    return this.askWithin<Answer>(undefined, event, payload)
  }

  public timeout(milliseconds: number) {
    return { ask: <Answer = unknown>(event: string, payload: unknown = undefined) => this.askWithin<Answer>(milliseconds, event, payload) }
  }

  private async askWithin<Answer>(timeout: number | undefined, event: string, payload: unknown) {
    const deadline = new Deadline(timeout)
    await wire.requestWithin(["wait-ready", this.owner.address, "server", true], deadline)

    const source = await wire.identity()
    const address = `client:${source.process}:${crypto.randomUUID()}`
    const questionId = crypto.randomUUID()
    const waiting = wire.expectWithin(address, deadline)
    wire.send("end-host", "ask", this.owner.address, "server", address, questionId, event, payload)
    try { return await waiting as Answer }
    finally { wire.forget(address) }
  }
}

class ClientEndpointHandle extends CoreClientEndpoint {
  public readonly subscribe: CoreClientEndpoint["subscribe"]
  public readonly wait: CoreClientEndpoint["wait"]
  public readonly events: CoreClientEndpoint["events"]
  public readonly traffic: TrafficHandle
  public readonly lifecycle: EndpointLifecycle
  public readonly window: Window

  public constructor(private readonly owner: ProcessHandle) {
    super()
    this.traffic = new TrafficHandle(owner.address, "client")
    this.lifecycle = endpointLifecycle(() => Promise.resolve(owner.address), "client")
    this.window = window(async () => owner.address)
    const events = endpointEvents(owner.address, "client")
    this.subscribe = events.subscribe
    this.wait = events.wait
    this.events = events.events
  }

  public async process() { return this.owner }
  public readonly publish: CoreClientEndpoint["publish"] = (event: string, payload: unknown = undefined) => {
    wire.send("end-host", "send", this.owner.address, "client", event, payload)
  }

  public async exists() {
    const answer = await wire.request(["exists", "client", this.owner.address]) as [boolean]
    return answer[0]
  }

  public async start(launch: ClientLaunch = {}) { await wire.request(["start-endpoint", this.owner.address, "client", launch]) }
  public async stop() { await wire.request(["stop-endpoint", this.owner.address, "client"]) }
  public async isService() { return (await wire.request(["is-service", "client", this.owner.address]) as [boolean])[0] }
  public async waitReady(timeout?: number) { await wire.request(["wait-ready", this.owner.address, "client"], timeout) }

}

class WindowHandle extends Events<WindowEvents, never> implements CoreWindow {
  public constructor(private readonly target: WindowTarget) {
    super(...deferredScoped("host-end", target, (_event, values) => values[0]))
  }

  private async state() {
    const answer = await wire.request(["window", await this.target()]) as [WindowRecord]
    return answer[0]
  }

  public async title() { return (await this.state()).title }
  public async position() { return (await this.state()).position }
  public async size() { return (await this.state()).size }
  public async minimized() { return (await this.state()).minimized }
  public async maximized() { return (await this.state()).maximized }
  public async front() { return (await this.state()).front }
  public async layer() { return (await this.state()).layer }
  public async move(position: Position) { await wire.request(["move", await this.target(), position]) }
  public async resize(size: Size) { await wire.request(["resize", await this.target(), size]) }
  public async setGeometry(geometry: WindowGeometry) { await wire.request(["setGeometry", await this.target(), geometry]) }
  public async minimize(minimized = true) { await wire.request(["minimize", await this.target(), minimized]) }
  public async maximize(maximized = true) { await wire.request(["maximize", await this.target(), maximized]) }
  public async changeTitle(title: string) { await wire.request(["changeTitle", await this.target(), title]) }
  public async raise() { await wire.request(["raise", await this.target()]) }
}

const windowTargets = new WeakMap<object, WindowTarget>()

class LocalWindowHandle implements LocalWindow {
  public constructor(
    private readonly target: WindowTarget,
    private readonly selected?: AppearanceTransaction | WaitedTransaction
  ) {}

  public transaction(transaction: AppearanceTransaction | WaitedTransaction): LocalWindowOperations {
    return new LocalWindowHandle(this.target, transaction)
  }

  public async addSurface() { await this.change("windowLocalSurfaceAdd") }
  public async removeSurface() { await this.change("windowLocalSurfaceRemove") }
  public async move(position: Position) { await this.change("windowLocalMove", position) }
  public async resize(size: Size) { await this.change("windowLocalResize", size) }
  public async setGeometry(geometry: WindowGeometry) { await this.change("windowLocalGeometry", geometry) }
  public async minimize(minimized = true) { await this.change("windowLocalMinimize", minimized) }
  public async maximize(maximized = true) { await this.change("windowLocalMaximize", maximized) }
  public async changeTitle(title: string) { await wire.request(["windowLocalTitle", await this.target(), title]) }
  public async follow(window: CoreWindow) {
    const target = windowTargets.get(window as object)
    if (!target) throw new Error("Local Window follow requires a Window from this Client SDK")
    await wire.request(["windowLocalFollow", await this.target(), await target(), this.selected])
  }
  public async unfollow() { await wire.request(["windowLocalUnfollow", await this.target(), this.selected]) }
  public async raise() { await wire.request(["windowLocalRaise", await this.target()]) }

  private async change(operation: string, value?: unknown) {
    await wire.request([operation, await this.target(), value, this.selected])
  }
}

type WindowTarget = () => Promise<HandleAddress>

function deferredScoped(route: string, target: WindowTarget, convert: (event: string, values: unknown[]) => unknown) {
  return [
    (event, listener, impossible) => {
      if (!windowEvent(event)) {
        impossible?.(new Error(`A Window has no "${event}" event`))
        return () => undefined
      }
      return deferred(target, subject => wire.on(route, event, (...values) => {
        const message = unscoped(subject, values)
        if (message) listener(convert(event, message))
      }, subject, impossible), impossible)
    },
    (listener, impossible) => deferred(target, subject => wire.onAll(route, (event, ...values) => {
      if (typeof event !== "string" || !windowEvent(event)) return
      const message = unscoped(subject, values)
      if (message) listener(event, convert(event, message))
    }, subject, impossible), impossible)
  ] as const satisfies ConstructorParameters<typeof Events>
}

function windowEvent(event: string) {
  return event === "move" || event === "resize" || event === "geometry" || event === "minimize" || event === "maximize" || event === "changeTitle" || event === "front"
}

function deferred(target: WindowTarget, register: (subject: string) => Cleanup, impossible?: (error: Error) => void): Cleanup {
  let active = true
  let stop: Cleanup = () => undefined

  void target().then(address => {
    if (active) stop = register(address.reference)
  }, error => {
    const failure = error instanceof Error ? error : new Error(String(error))
    if (active && impossible) impossible(failure)
    else if (active) queueMicrotask(() => { throw failure })
  })

  return () => {
    active = false
    stop()
  }
}

export function scoped<Definitions extends object = {}, Fallback = unknown>(route: string, subject: string | null, convert: (event: string, values: unknown[]) => unknown) {
  return new Events<Definitions, Fallback>(
    (event, listener, impossible) => wire.on(route, event, (...values) => {
      const message = unscoped(subject, values)
      if (message) listener(convert(event, message))
    }, subject, impossible),
    (listener, impossible) => wire.onAll(route, (event, ...values) => {
      if (typeof event !== "string") return
      const message = unscoped(subject, values)
      if (message) listener(event, convert(event, message))
    }, subject, impossible)
  )
}

/** Destinationless events originating from one Endpoint handle. */
export function endpointEvents(target: HandleAddress | null, half: "server" | "client") {
  return new Events(
    (event, listener, impossible) => wire.follow(target, half, event, listener, impossible),
    (listener, impossible) => wire.follow(target, half, null, (event, payload) => {
      if (typeof event === "string") listener(event, payload)
    }, impossible)
  )
}

/** Start and stop transitions belonging directly to one permanent Endpoint. */
export function endpointLifecycle(target: WindowTarget, half: "server" | "client") {
  return new Events<EndpointLifecycleEvents, never>(
    (event, listener, impossible) => deferred(target, subject => wire.on(
      "process-host",
      endpointLifecycleEvent(event),
      (...values) => {
        const message = unscoped(subject, values)
        if (message?.[1] === half) listener(undefined)
      },
      subject,
      impossible
    ), impossible),
    (listener, impossible) => deferred(target, subject => wire.onAll("process-host", (event, ...values) => {
      if (event !== "endpointStart" && event !== "endpointStop") return
      const message = unscoped(subject, values)
      if (message?.[1] === half) listener(event === "endpointStart" ? "start" : "stop", undefined)
    }, subject, impossible), impossible)
  )
}

function endpointLifecycleEvent(event: string) {
  if (event === "start") return "endpointStart"
  if (event === "stop") return "endpointStop"
  return event
}

function unscoped(subject: string | null, values: unknown[]) {
  if (subject === null) return values
  return values[0] === subject ? values.slice(1) : null
}

function programProcessEvent(event: string, values: unknown[]): unknown {
  if (event === "create") return process(values[0])
  if (event === "exit") return { process: process(values[0]), ...exit(values[1], values[2]) }
  return undefined
}

function programEvent(event: string, values: unknown[]): unknown {
  if (event === "uninstall") return values[0] === true
  return undefined
}

function processEvent(event: string, values: unknown[]): unknown {
  if (event === "exit") return exit(values[0], values[1])
  return undefined
}

export function exit(code: unknown, signal: unknown): Exit {
  const namedSignal = stringOrNull(signal)
  return { status: namedSignal === null ? "exited" : "signaled", code: numberOrNull(code), signal: namedSignal }
}

function numberOrNull(value: unknown) { return typeof value === "number" ? value : null }
function stringOrNull(value: unknown) { return typeof value === "string" ? value : null }

export function trafficMessage(value: unknown): TrafficMessage {
  const raw = value as { to?: EndpointReference | null, payload?: unknown }
  return { to: visibleEndpoint(raw.to), payload: raw.payload }
}

export function program(value: unknown): Program {
  const record = parseProgramSnapshot(value)
  const handle = handles.obtain(`program:${record.reference}`, () => new ProgramHandle(record))
  handle.update(record)
  return handle
}

export function process(value: unknown, endpoints: { server?: ServerEndpoint, client?: ClientEndpoint } = {}): Process {
  const record = parseProcessSnapshot(value)
  return handles.obtain(`process:${record.reference}`, () => new ProcessHandle(record, endpoints))
}

export function endpoint(value: unknown): Endpoint {
  const reference = parseEndpointReference(value)
  const owner = process(reference.process)
  return reference.kind === "server" ? owner.server : owner.client
}

export function claimEndpoint(reference: string, kind: "server" | "client", endpoint: Endpoint) {
  return handles.adopt(`endpoint:${reference}:${kind}`, endpoint)
}

function endpointHandle(owner: ProcessHandle, kind: "server" | "client", preferred?: Endpoint) {
  return handles.obtain(`endpoint:${owner.reference}:${kind}`, () => preferred ?? (
    kind === "server" ? new ServerEndpointHandle(owner) : new ClientEndpointHandle(owner)
  ))
}

export function window(target: WindowTarget): Window {
  const handle = new WindowHandle(target)
  windowTargets.set(handle, target)
  return handle
}

export function localWindow(target: WindowTarget): LocalWindow {
  return new LocalWindowHandle(target)
}

/** Resolves an Endpoint reference through the Client Endpoint's global handle registry. */
export function visibleEndpoint(reference: EndpointReference | null | undefined): Endpoint | null {
  if (reference === null) return null
  return endpoint(reference)
}

/** Runtime constructor shared by all client-visible Program handles. */
export const Program = CoreProgram

/** Runtime constructor shared by all client-visible Process handles. */
export const Process = CoreProcess

/** Runtime constructor shared by all client-visible Endpoint handles. */
export const Endpoint = CoreEndpoint

/** Runtime constructor shared by all client-visible Server Endpoint handles. */
export const ServerEndpoint = CoreServerEndpoint

/** Runtime constructor shared by all client-visible Client Endpoint handles. */
export const ClientEndpoint = CoreClientEndpoint
