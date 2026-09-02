# `@phreshos/client`

The SDK for a PhreshOS Program's Client Endpoint.

The Client SDK adapts the Desktop boundary to the shared Core domain model. It
exposes the same complete `system` contract as the Server and Node SDKs, the
current Client `context`, and the Client's `desktop` environment.

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
await context.localWindow.move({ x: 20, y: 20 })
```

`context` belongs to the executing Client. It provides communication,
navigation to its Program and Process, its paired Server, and command-only
control of its local Window representation.

## System

```ts
import { system } from "@phreshos/client"

const appearance = await system.appearance.snapshot()
const programs = await system.program.list()
const processes = await system.process.list()
```

`system` is the complete global System contract sourced from Core.

## Desktop

```ts
import { desktop } from "@phreshos/client"

const surface = await desktop.surface.snapshot()
const preferences = await desktop.preferences.snapshot()
```

Desktop capabilities remain separate from the global System and the current
execution Context.

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
