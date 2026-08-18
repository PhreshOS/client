# `@phreshos/client`

The Client SDK defines the contextual capabilities available inside a
Program's client endpoint.

## Package status

This package is one component of a larger architecture that is still under
active testing. The architecture's components will be released in stages as
their contracts and integrations are verified.

`@phreshos/client` is not intended to be used on its own. It requires the
shared contracts from `@phreshos/core` and a compatible desktop boundary to
provide its runtime environment.

It uses the domain objects and shared contracts from `@phreshos/core` through
a peer dependency. It does not redefine those objects, own server-side
capabilities, or contain host and transport implementations.

Its `Host` contract exposes only desktop-session capabilities: the public
system Theme, surface and pointer state, publicly served values, and
unrestricted server-side Fetch. `host.theme.snapshot()` explicitly and
asynchronously reads the current snapshot retained by the desktop host.
`host.theme.subscribe("change", listener)` is an ordinary live subscription:
it receives only complete replacements published after registration, with no
initial value or replay. The Client cannot write the authoritative value. The
Host does not expose system-wide Program or Process discovery.

Surface and pointer access are independent objects rather than events merged
into Host:

```ts
const surface = await host.surface.size()
const stopSurface = host.surface.subscribe("resize", next => undefined)

const position = await host.pointer.position()
const stopPointer = host.pointer.subscribe("move", next => undefined)
```

A Surface contains only the width and height of the current Client Window's
own layer. Client code cannot select another layer, and the desktop's gutter
never enters an endpoint. Pointer position and movement both require the
`pointer` permission. Reads are asynchronous requests; subscriptions receive
only future publications and never replay a retained value.

A Client may traverse `Process.parent()` through any number of ancestors in
its own Program. The first parent outside that Program is structurally hidden
and returned as `null`; no cross-Program Process handle enters the client. If
client code fabricates or otherwise obtains an unauthorized handle, the system
responds exactly as it does for a nonexistent Process.

Its JavaScript entry point adapts the iframe boundary to these contracts. The
SDK owns callbacks, waits, queues, and their cleanup; the boundary owns only
the forwarding registrations requested by the SDK.

Importing the SDK and establishing the iframe's host lease inject no message
into the endpoint. Identity, Theme, Process, Window, readiness, lifecycle, and
application values enter only in response to an explicit request or a live
registration made by Program code.

`Current` combines navigation into the executing Client's Process with its
Channel. The paired Server is explicitly named as
`current.server`; its publishing, asking, existence, readiness, start, and stop
operations never masquerade as properties of `current`. `current.stop()` stops
the executing Client, while complete Process exit remains available only
through `current.process()`. It is the canonical Process-owned handle, so
`current.server === (await current.process()).server`.
Endpoint `process()` navigation is asynchronous; contextual ownership is
requested only when navigation needs it and then retained by the SDK.

All domain handles are canonical within this iframe's JavaScript realm. Lookup,
navigation, event payloads, and message metadata reuse the same weakly retained
handle. A Client and its synchronous `window` capability remain stable for the
Process lifetime; Window operations always address that Client's current live
presentation state.

`server.ask()` does not route a question before the current Server incarnation
is ready. The Client SDK owns one deadline across readiness and the answer;
absence or incarnation loss rejects without turning the boundary into a waiter.

The package provides two contextual runtime entry points:

```ts
import { host, current } from "@phreshos/client"
```

It also re-exports the shared Core runtime classes—`Program`, `Process`,
`Endpoint`, `Server`, and `Client`—and refines the handles returned through
them. These are the same domain classes used by the Server SDK, so
`instanceof Server` and `instanceof Client` retain one meaning. `Window`, like
`ClientTraffic`, is a type-only capability owned by Client and has no
independent `instanceof` identity.

The current Client's Channel is composed directly into `current`. Its
subscription tools receive events addressed to this Client, while `publish()`
emits outward from this Client without choosing a destination. Existence,
readiness, and lifecycle operations belong to `current.server`,
`current.stop()`, or an explicit Endpoint handle.

An Endpoint handle is also a selective source: `endpoint.subscribe()` follows
destinationless events emitted by that Endpoint. Its `traffic` property remains
reserved for directed publications, questions, and answers.

Messages sent by an Endpoint in the same Program contain that real Endpoint in
`from`. If the sender belongs to another Program, `from` is `null`; the foreign
identity is removed by the server host before the message reaches the desktop.
The same rule applies to Client-visible traffic destinations.

Client-visible Program handles can operate only within their own Program.
They deliberately omit `install()` and `fork()`, and their storage areas never
expose host filesystem paths. Client Window capabilities add awaitable
`localMove()` and `localResize()` for representation-local gestures. Their
Promises confirm that the current Client host accepted and applied the local
draft; they do not enter server authority or emit Window events.

An `under` or `over` Client may own one authoritative host-rendered Surface.
The capability remains silent until Program code explicitly reads, changes, or
subscribes to it:

```ts
const initial = await window.surface.snapshot()

const stop = window.surface.subscribe("change", surface => {
  // Future replacements only; subscriptions do not replay `initial`.
})

await window.surface.set({
  opacity: 0.65,
  radius: "large",
  transaction: { duration: 240, easing: "ease-out" }
})

await window.surface.remove()
```

The server stores the target beside its Window and broadcasts complete future
replacements. `set()` with no settings creates a sharp, fully opaque Surface.
Opacity is a finite number from `0` through `1`; zero retains the Surface node.
Radius accepts a nonnegative pixel number, a Theme-derived `ScaleLevel`, or
`"full"`. Only `remove()` restores exact `null` and immediately removes the
node. The optional transaction uses milliseconds and a stable named or cubic
Bézier easing; the desktop performs the motion, honors reduced motion, and does
not replay a stored transaction when restoring an initial snapshot. The sharp
container follows the iframe geometry while the independently rounded Surface
neither clips nor masks Client content. `window` and `wallpaper` layers reject
the capability.

`program.icon()` requests the current Program's guaranteed PNG `Blob` on
demand. The desktop derives the Program from the calling frame; no identity,
private asset address, or filesystem path crosses from Client code.

Persistent startup is deliberately absent. Only a Server endpoint may change
whether an installed Program creates a Process when the system starts.
