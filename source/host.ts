import type {
  ClientServiceHandler,
  ServedFile,
  ServerServiceHandler,
  ServiceKey,
  Theme,
  ThemeProperties
} from "@phreshos/core"
import { content } from "./content.js"
import ClientTheme from "./theme.js"
import wire from "./wire.js"
import ClientPointer, { type HostPointer } from "./pointer.js"
import ClientDesktop, { type HostDesktop } from "./desktop.js"
import { prepareService } from "./service.js"

/** Desktop capabilities structurally available to a Client endpoint. */
export interface Host {
  /** Read-only system Theme explicitly read from and observed through the desktop host. */
  readonly theme: Theme<ThemeProperties>

  /** Layer-independent desktop size reads and live updates. */
  readonly desktop: HostDesktop

  /** Permission-guarded desktop pointer reads and live movement. */
  readonly pointer: HostPointer

  /** Stores one value as a publicly reachable file. */
  serve(value: unknown): Promise<ServedFile>

  /** Performs an unrestricted server-side fetch on behalf of this Client. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>

  /** Returns a stable handle for one exact Server service identity. */
  service<ServiceEvents extends object = {}>(key: {
    program: string
    endpoint: "server"
    name: string
  }): ServerServiceHandler<ServiceEvents>

  /** Returns a stable handle for one exact Client service identity. */
  service<ServiceEvents extends object = {}>(key: {
    program: string
    endpoint: "client"
    name: string
  }): ClientServiceHandler<ServiceEvents>
}

class ClientHost {
  public readonly theme = new ClientTheme() as unknown as Theme<ThemeProperties>
  public readonly desktop = new ClientDesktop() as unknown as HostDesktop
  public readonly pointer = new ClientPointer() as unknown as HostPointer

  public service<ServiceEvents extends object = {}>(key: ServiceKey & { endpoint: "server" }): ServerServiceHandler<ServiceEvents>
  public service<ServiceEvents extends object = {}>(key: ServiceKey & { endpoint: "client" }): ClientServiceHandler<ServiceEvents>
  public service(key: ServiceKey) { return prepareService(key) }

  public async serve(value: unknown): Promise<ServedFile> {
    const source = content(value)
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")

    try {
      const answer = await wire.request(
        ["serve", source.body, { extension: source.extension, type: source.type }, channel.port2],
        undefined,
        source.body instanceof ReadableStream ? [source.body, channel.port2] : [channel.port2]
      ) as [ServedFile]
      channel.port1.close()
      return answer[0]
    } catch (error) {
      abort()
      channel.port1.close()
      throw error
    }
  }

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
      ? controlled(result.body, abort, () => closeControl(request.signal, control.port1, abort))
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

function controlled(body: ReadableStream<Uint8Array>, abort: () => void, close: () => void) {
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          close()
          controller.close()
        } else controller.enqueue(next.value)
      } catch (error) {
        close()
        controller.error(error)
      }
    },
    async cancel(reason) {
      abort()
      close()
      await reader.cancel(reason)
    }
  })
}

function closeControl(signal: AbortSignal, port: MessagePort, abort: () => void) {
  signal.removeEventListener("abort", abort)
  port.close()
}

/** Desktop capabilities available to this Client. */
export const host: Host = new ClientHost()
