import {
  parseShellEvent,
  type ClientService,
  type ProgramDefinition,
  type ServerService,
  type ServiceKey,
  type ShellOptions,
  type System as CoreSystem,
  type SystemProcess as CoreSystemProcess,
  type SystemProcessEvents,
  type SystemProgram as CoreSystemProgram,
  type SystemProgramEvents,
  type WritableAppearance
} from "@phreshos/core"
import ClientAppearance from "./appearance.js"
import wire from "./wire.js"
import { prepareService } from "./service.js"
import { uploads } from "./uploads.js"
import controlledStream from "./controlled-stream.js"
import Events from "./events.js"
import { exit, process, program, type ProcessRecord, type ProgramRecord } from "./domain.js"
import { systemStorage } from "./storage.js"
import websocket from "./websocket.js"

type ServiceEndpoint = ServiceKey["endpoint"]

type ServiceAddress<Endpoint extends ServiceEndpoint> = Omit<ServiceKey, "endpoint"> & Readonly<{
  endpoint: Endpoint
}>

type ServiceHandle<Endpoint extends ServiceEndpoint, Events extends object, Fallback = unknown> = Endpoint extends "server"
  ? ServerService<Events, Fallback>
  : ClientService<Events, Fallback>

class ClientSystem implements CoreSystem {
  public readonly storage = systemStorage()
  public readonly appearance: WritableAppearance = new ClientAppearance()
  public readonly program: CoreSystemProgram = new SystemProgramHandle()
  public readonly process: CoreSystemProcess = new SystemProcessHandle()
  public readonly uploads = uploads

  public async forceCreateProgram(source: ProgramDefinition | string) {
    const answer = await wire.request(["host-program-force-create", source]) as [ProgramRecord]
    return program(answer[0])
  }

  public service<Endpoint extends ServiceEndpoint>(key: ServiceAddress<Endpoint>): ServiceHandle<Endpoint, {}>
  public service<ServiceEvents extends object, Fallback = unknown>(key: ServiceAddress<"server">): ServerService<ServiceEvents, Fallback>
  public service<ServiceEvents extends object, Fallback = unknown>(key: ServiceAddress<"client">): ClientService<ServiceEvents, Fallback>
  public service(key: ServiceKey): unknown { return prepareService(key) }

  public async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = new Request(input, {
      ...init,
      ...init?.body instanceof ReadableStream ? { duplex: "half" } : {}
    } as RequestInit & { duplex?: "half" })
    const body = request.body
    const control = new MessageChannel()
    const abort = () => control.port1.postMessage("abort")

    if (request.signal.aborted) {
      control.port1.close()
      control.port2.close()
      throw request.signal.reason
    }

    request.signal.addEventListener("abort", abort, { once: true })

    const description: ProxyRequest = {
      body: body !== null,
      cache: request.cache,
      credentials: request.credentials,
      headers: requestHeaders(request.headers, init?.headers),
      integrity: request.integrity,
      keepalive: request.keepalive,
      method: request.method,
      mode: request.mode,
      redirect: request.redirect,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      url: request.url
    }

    let result: ProxyResponse

    try {
      const answer = await wire.request(
        ["fetch", description, body, control.port2],
        undefined,
        body ? [body, control.port2] : [control.port2]
      ) as [ProxyResponse]
      result = answer[0]
    } catch (error) {
      abort()
      closeControl(request.signal, control.port1, abort)
      throw request.signal.aborted ? request.signal.reason : error
    }

    const responseBody = result.body
      ? controlledStream(result.body, abort, () => closeControl(request.signal, control.port1, abort))
      : null

    if (!responseBody) closeControl(request.signal, control.port1, abort)

    const response = new Response(responseBody, {
      headers: result.headers,
      status: result.status,
      statusText: result.statusText
    })

    Object.defineProperties(response, {
      redirected: { configurable: true, enumerable: true, value: result.redirected },
      type: { configurable: true, enumerable: true, value: result.type },
      url: { configurable: true, enumerable: true, value: result.url }
    })

    return response
  }

  public websocket(url: string | URL, protocols?: string | string[]) {
    return websocket(url, protocols)
  }

  public async *shell(command: string, options: ShellOptions = {}) {
    const { signal, ...settings } = options

    for await (const event of wire.stream(["shell", command, settings], undefined, signal)) yield parseShellEvent(event)
  }

}

class SystemProgramHandle extends Events<SystemProgramEvents, never> implements CoreSystemProgram {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-program", event, (...values) => listener(systemProgramEvent(event, values)), null, impossible),
      observer => wire.onAll("host-program", (event, ...values) => {
        if (typeof event === "string") observer(event, systemProgramEvent(event, values))
      })
    )
  }

  public async list(onlyInstalled = false) {
    const answer = await wire.request(["host-program-list", onlyInstalled]) as [ProgramRecord[]]
    return answer[0].map(program)
  }

  public async find(identity: string) {
    const answer = await wire.request(["host-program-find", identity]) as [ProgramRecord | null]
    return answer[0] ? program(answer[0]) : null
  }

  public async create(source: ProgramDefinition | string) {
    const answer = await wire.request(["host-program-create", source]) as [ProgramRecord]
    return program(answer[0])
  }
}

class SystemProcessHandle extends Events<SystemProcessEvents, never> implements CoreSystemProcess {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-process", event, (...values) => listener(systemProcessEvent(event, values)), null, impossible),
      observer => wire.onAll("host-process", (event, ...values) => {
        if (typeof event === "string") observer(event, systemProcessEvent(event, values))
      })
    )
  }

  public async list() {
    const answer = await wire.request(["host-process-list"]) as [ProcessRecord[]]
    return answer[0].map(record => process(record))
  }

  public async find(identity: string) {
    const answer = await wire.request(["host-process-find", identity]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }
}

function systemProcessEvent(event: string, values: unknown[]): unknown {
  if (event === "create") return process(values[1] as ProcessRecord)
  if (event === "exit") return { process: process(values[1] as ProcessRecord), ...exit(values[2], values[3]) }
  return values[0]
}

function systemProgramEvent(event: string, values: unknown[]): unknown {
  if (event === "create" || event === "forget" || event === "install") return program(values[1] as ProgramRecord)
  if (event === "uninstall") return { program: program(values[1] as ProgramRecord), everything: values[2] === true }
  return values[0]
}

interface ProxyRequest {
  body: boolean
  cache: RequestCache
  credentials: RequestCredentials
  headers: [string, string][]
  integrity: string
  keepalive: boolean
  method: string
  mode: RequestMode
  redirect: RequestRedirect
  referrer: string
  referrerPolicy: ReferrerPolicy
  url: string
}

interface ProxyResponse {
  body: ReadableStream<Uint8Array> | null
  headers: [string, string][]
  redirected: boolean
  status: number
  statusText: string
  type: ResponseType
  url: string
}

function requestHeaders(normalized: Headers, supplied?: HeadersInit): [string, string][] {
  if (!supplied) return [...normalized.entries()]

  const explicit = supplied instanceof Headers
    ? [...supplied.entries()]
    : Array.isArray(supplied)
      ? supplied.map(([name, value]) => [name, value] as [string, string])
      : Object.entries(supplied)

  const names = new Set(explicit.map(([name]) => name.toLowerCase()))
  return [...normalized.entries()].filter(([name]) => !names.has(name.toLowerCase())).concat(explicit)
}

function closeControl(signal: AbortSignal, port: MessagePort, abort: () => void) {
  signal.removeEventListener("abort", abort)
  port.close()
}

/** The global System represented through this Client runtime. */
export const system: CoreSystem = new ClientSystem()
