# `@phreshos/client`

The runtime adapter for a PhreshOS Program's Client Endpoint.

[Documentation](https://docs.phreshos.com/sdks/client) ·
[Client Context](https://docs.phreshos.com/runtime/context) ·
[Desktop](https://docs.phreshos.com/system/desktop) ·
[Source](https://github.com/PhreshOS/client)

## Role

The Client SDK exposes three separate Core contracts inside a Client Endpoint:
the global `system`, the current Client `context`, and the containing `desktop`.
It adapts the Desktop boundary without defining client-specific versions of the
shared Program, Process, Endpoint, or Service domains.

The System enforces Client authority. The SDK carries requests and preserves
canonical handles; it does not own authoritative state or visual components.

## Installation

| Package manager | Command |
| --- | --- |
| npm | `npm install @phreshos/client` |
| pnpm | `pnpm add @phreshos/client` |
| Bun | `bun add @phreshos/client` |
| Yarn | `yarn add @phreshos/client` |

`@phreshos/core` is a peer dependency.

```ts
import { context, desktop, system } from "@phreshos/client"

const program = await context.program()
const preferences = await desktop.preferences.snapshot()
const appearance = await system.appearance.snapshot()
```

See [Client SDK](https://docs.phreshos.com/sdks/client) for the complete entry
points and authority boundary.

## Development

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` checks the types and completions, builds the package, and validates its
published shape.

## Related repositories

- [`@phreshos/core`](https://github.com/PhreshOS/core) owns every shared
  contract and domain class exposed here.
- [`@phreshos/server`](https://github.com/PhreshOS/server) adapts the paired
  Server Endpoint boundary.
- [`@phreshos/react`](https://github.com/PhreshOS/react) adapts the Client
  sources to React without depending on this package.
- [PhreshOS System](https://github.com/PhreshOS/system) owns enforcement,
  routing, and the Desktop host.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the repository workflow and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

Licensed under the [MIT License](LICENSE). Copyright © 2026 Zohayr SLILEH.
