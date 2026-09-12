import type { ServerEndpoint } from "@phreshos/core"
import { context } from "../source/main.js"

context.server.lifecycle.subscribe("start", () => undefined)

context.server.subscribe("unknown", message => void message)
context.server.wait("unknown")
context.server.events("unknown")

function declaredServer(server: ServerEndpoint<{ changed: number }>) {
  server.subscribe("changed", message => message.toFixed(0))
  server.wait("changed")
  server.events("changed")
  server.subscribe("unknown", message => void message)
}

void declaredServer

function closedServer(server: ServerEndpoint<{}, never>) {
  // @ts-expect-error An explicitly closed Server Endpoint rejects undeclared events.
  server.subscribe("unknown", () => undefined)
}

void closedServer
