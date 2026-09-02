import type { ProgramSql, ProgramStore, Storage as CoreStorage } from "@phreshos/core"
import { content, type ContentBody } from "./content.js"
import controlledStream from "./controlled-stream.js"
import type { HandleAddress } from "./domain.js"
import wire from "./wire.js"

export type Storage = CoreStorage

/** Client-side access to one exact Program storage area. */
export function area(program: HandleAddress, which: "data" | "cache"): Storage {
  async function ask<Result>(operation: string, ...values: unknown[]) {
    const answer = await wire.request([which, program, operation, ...values]) as [Result]
    return answer[0]
  }

  async function transfer(operation: "stream" | "write", path: string[], body: ContentBody | null = null) {
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")
    const close = () => channel.port1.close()

    try {
      const answer = await wire.request(
        [which, program, operation, path, body, channel.port2],
        undefined,
        body instanceof ReadableStream ? [body, channel.port2] : [channel.port2]
      ) as [unknown]

      if (operation === "write") {
        close()
        return null
      }

      if (!(answer[0] instanceof ReadableStream)) throw new Error("The storage response has no byte stream")
      return controlledStream(answer[0], abort, close)
    } catch (error) {
      abort()
      close()
      throw error
    }
  }

  async function stream(...path: [string, ...string[]]) {
    const body = await transfer("stream", path)
    if (!body) throw new Error("The storage response has no body")
    return body
  }

  return {
    path: () => ask("path"),
    resolve: (...path) => ask("resolve", ...path),
    stream,
    async bytes(...path) { return new Uint8Array(await new Response(await stream(...path)).arrayBuffer()) },
    async text(...path) { return new Response(await stream(...path)).text() },
    async json<Value>(...path: [string, ...string[]]) { return JSON.parse(await new Response(await stream(...path)).text()) as Value },
    async write(...args: [...path: [string, ...string[]], value: unknown]) {
      await transfer("write", args.slice(0, -1) as string[], content(args.at(-1)).body)
    },
    stat: (...path) => ask("stat", ...path),
    list: (...path) => ask("list", ...path),
    delete: (...path) => ask("delete", ...path),
    clear: (...path) => ask("clear", ...path)
  }
}

export function store(program: HandleAddress): ProgramStore {
  async function ask<Result>(operation: string, ...values: unknown[]) {
    const answer = await wire.request(["store", program, operation, ...values]) as [Result]
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

export function sql(kind: "database" | "logs", program: HandleAddress): ProgramSql {
  return {
    async query<Row = Record<string, unknown>>(statement: string | TemplateStringsArray, ...rest: unknown[]) {
      const text = typeof statement === "string" ? statement : statement.raw.join("?")
      const values = typeof statement === "string" ? (Array.isArray(rest[0]) ? rest[0] : []) : rest
      const answer = await wire.request([kind, program, text, values]) as [Row[]]
      return answer[0]
    }
  }
}

/** Access to the System's native storage through the Client boundary. */
export function systemStorage(): Storage {
  async function ask<Result>(operation: string, ...values: unknown[]) {
    const answer = await wire.request(["host-storage", operation, ...values]) as [Result]
    return answer[0]
  }

  async function transfer(operation: "stream" | "write", path: string[], body: ContentBody | null = null) {
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")
    const close = () => channel.port1.close()

    try {
      const answer = await wire.request(
        [`host-storage-${operation}`, path, body, channel.port2],
        undefined,
        body instanceof ReadableStream ? [body, channel.port2] : [channel.port2]
      ) as [unknown]

      if (operation === "write") {
        close()
        return null
      }

      if (!(answer[0] instanceof ReadableStream)) throw new Error("The storage response has no byte stream")
      return controlledStream(answer[0], abort, close)
    } catch (error) {
      abort()
      close()
      throw error
    }
  }

  async function stream(...path: [string, ...string[]]) {
    const body = await transfer("stream", path)
    if (!body) throw new Error("The storage response has no body")
    return body
  }

  return {
    path: () => ask("path"),
    resolve: (...path) => ask("resolve", ...path),
    stream,
    async bytes(...path) { return new Uint8Array(await new Response(await stream(...path)).arrayBuffer()) },
    async text(...path) { return new Response(await stream(...path)).text() },
    async json<Value>(...path: [string, ...string[]]) { return JSON.parse(await new Response(await stream(...path)).text()) as Value },
    async write(...args: [...path: [string, ...string[]], value: unknown]) {
      const path = args.slice(0, -1) as string[]
      await transfer("write", path, content(args.at(-1)).body)
    },
    stat: (...path) => ask("stat", ...path),
    list: (...path) => ask("list", ...path),
    delete: (...path) => ask("delete", ...path),
    clear: (...path) => ask("clear", ...path)
  }
}
