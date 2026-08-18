# Contributing

Client owns the Program Client endpoint's adaptation to the PhreshOS iframe
boundary. A change belongs here when it implements a Client-facing capability
without moving system authority, transport policy, or shared vocabulary into
the SDK.

## Development

Install the pinned toolchain and verify the complete repository:

```sh
bun install --frozen-lockfile
bun run verify
```

`verify` type-checks and rebuilds the source, packs the actual publication
artifact, installs it in a temporary consumer, checks its runtime and
TypeScript entry points, and confirms that startup emits only the Client
endpoint's document announcement.

Keep the endpoint silent by default: importing the package may announce its
document outward, but no host state may enter unless Program code explicitly
requests it or establishes a live registration. Keep shared contracts in
`@phreshos/core` and host implementations in the system.

Changes should include focused verification for public runtime behavior and
must preserve the built-only package boundary. Consumers must never import
repository source paths.

## Pull requests

Explain the Client capability the change serves, update public documentation
when its contract changes, and keep each pull request focused on one coherent
change.
