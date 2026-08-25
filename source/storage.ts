import type { ProgramSql, ProgramStore, Storage } from "@phreshos/core"
import { content, type ContentBody } from "./content.js"
import wire from "./wire.js"

/** Client-side Program storage, structurally scoped by the iframe boundary. */
export function area(which: "data" | "cache"): Storage {
  async function ask<Result>(operation: string, ...values: unknown[]) {
    const answer = await wire.request([which, undefined, operation, ...values]) as [Result]
    return answer[0]
  }

  async function transfer(operation: "stream" | "write", path: string[], body: ContentBody | null = null) {
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")
    const close = () => channel.port1.close()

    try {
      const answer = await wire.request(
        [which, undefined, operation, path, body, channel.port2],
        undefined,
        body instanceof ReadableStream ? [body, channel.port2] : [channel.port2]
      ) as [unknown]

      if (operation === "write") {
        close()
        return null
      }

      if (!(answer[0] instanceof ReadableStream)) throw new Error("The storage response has no byte stream")
      return controlled(answer[0], abort, close)
    } catch (error) {
      abort()
      close()
      throw error
    }
  }

  async function stream(...path: string[]) {
    const body = await transfer("stream", path)
    if (!body) throw new Error("The storage response has no body")
    return body
  }

  return {
    stream,
    async bytes(...path) { return new Uint8Array(await new Response(await stream(...path)).arrayBuffer()) },
    async text(...path) { return new Response(await stream(...path)).text() },
    async json<Value>(...path: string[]) { return JSON.parse(await new Response(await stream(...path)).text()) as Value },
    async write(...args: [...path: string[], value: unknown]) {
      if (args.length < 2) throw new Error("Writing takes a file name and what to write")
      await transfer("write", args.slice(0, -1) as string[], content(args.at(-1)).body)
    },
    stat: (...path) => ask("stat", ...path),
    list: (...path) => ask("list", ...path),
    delete: (...path) => ask("delete", ...path),
    clear: (...path) => ask("clear", ...path)
  } as Storage
}

export function store(): ProgramStore {
  async function ask<Result>(operation: string, ...values: unknown[]) {
    const answer = await wire.request(["store", undefined, operation, ...values]) as [Result]
    return answer[0]
  }

  return {
    get: <Value>(key: string) => ask<Value | undefined>("get", key),
    set: <Value>(key: string, value: Value, ttl?: number) => ask<boolean>("set", key, value, ttl),
    delete: (key: string | string[]) => ask<boolean>("delete", key),
    has: (key: string) => ask<boolean>("has", key),
    clear: () => ask<void>("clear")
  }
}

export function sql(kind: "database" | "logs"): ProgramSql {
  return {
    async query<Row = Record<string, unknown>>(statement: string | TemplateStringsArray, ...rest: unknown[]) {
      const text = typeof statement === "string" ? statement : statement.raw.join("?")
      const values = typeof statement === "string" ? (Array.isArray(rest[0]) ? rest[0] : []) : rest
      const answer = await wire.request([kind, undefined, text, values]) as [Row[]]
      return answer[0]
    }
  }
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
