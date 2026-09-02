import { context, type ContextServer } from "../source/main.js"

context.server.lifecycle.subscribe("start", () => undefined)

context.server.subscribe("unknown", message => void message)
context.server.waitFor("unknown")
context.server.events("unknown")

function declaredServer(server: ContextServer<{ changed: number }>) {
  server.subscribe("changed", message => message.toFixed(0))
  server.waitFor("changed")
  server.events("changed")
  server.subscribe("unknown", message => void message)
}

void declaredServer

function closedServer(server: ContextServer<{}, never>) {
  // @ts-expect-error An explicitly closed Server Endpoint rejects undeclared events.
  server.subscribe("unknown", () => undefined)
}

void closedServer
