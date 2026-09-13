import type { Network } from "@phreshos/core"
import wire from "./wire.js"
import controlledStream from "./controlled-stream.js"
import websocket from "./websocket.js"

class ClientNetwork implements Network {
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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

  websocket(url: string | URL, protocols?: string | string[]) {
    return websocket(url, protocols)
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

function closeControl(signal: AbortSignal, port: MessagePort, abort: () => void) {
  signal.removeEventListener("abort", abort)
  port.close()
}

export default new ClientNetwork()
