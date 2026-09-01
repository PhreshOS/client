# `@phreshos/client`

The SDK for a PhreshOS Program's Client Endpoint.

The Client SDK adapts the sandboxed desktop boundary to the shared Core domain
model. It exposes the restricted `system` and `context` available inside a
Client without redefining Program, Process, Endpoint, Server, or Client.

## Installation

| Package manager | Command |
| --- | --- |
| npm | `npm install @phreshos/client` |
| pnpm | `pnpm add @phreshos/client` |
| Bun | `bun add @phreshos/client` |
| Yarn | `yarn add @phreshos/client` |

`@phreshos/core` is a peer dependency.

## Context

```ts
import { context } from "@phreshos/client"

context.subscribe("changed", message => {
  console.log(message)
})

context.publish("changed", { value: 1 })

const program = await context.program()
const process = await context.process()
const server = context.server
const window = context.window
```

`context` belongs to the executing Client. It provides communication,
navigation to its Program and Process, its paired Server, its Window, and
Client-owned capabilities.

## System

```ts
import { system } from "@phreshos/client"

const appearance = await system.appearance.snapshot()
const surface = await system.desktop.surface.snapshot()
const pointer = await system.desktop.pointer.snapshot()
const preferences = await system.desktop.preferences.snapshot()
```

The Client System exposes only capabilities allowed by the desktop boundary:
read-only Appearance, desktop surface and pointer state, writable desktop
preferences, uploads, Fetch, and exact Service handles. It does not expose
system-wide Program or Process registries.

Requests read current state. Subscriptions observe future publications and do
not replay an initial value. Importing the SDK performs neither operation.

## Development

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` checks the source, completion surface, build, and published package
shape.

See the [Client and Server documentation](https://github.com/PhreshOS/docs/blob/main/content/docs/sdks/client-and-server.mdx)
for the shared model and authority boundary.

## Repository boundary

This repository owns the Client runtime adapter. Core owns the domain model, the
System owns enforcement and forwarding, React owns framework adaptation, and
React UI owns visual interpretation.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
