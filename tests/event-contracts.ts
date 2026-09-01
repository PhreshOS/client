import { context, type ContextServer } from "../source/main.js"

context.server.lifecycle.subscribe("start", () => undefined)

// @ts-expect-error The current Server has no undeclared application events.
context.server.subscribe("unknown", () => undefined)

// @ts-expect-error The current Server has no undeclared application events.
context.server.waitFor("unknown")

// @ts-expect-error The current Server has no undeclared application events.
context.server.events("unknown")

function declaredServer(server: ContextServer<{ changed: number }>) {
  server.subscribe("changed", message => message.toFixed(0))
  server.waitFor("changed")
  server.events("changed")
}

void declaredServer
