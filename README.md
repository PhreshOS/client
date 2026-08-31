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
capabilities, or contain System and transport implementations.

Its `System` contract exposes only desktop-session capabilities: read-only
System Appearance, mutable preferences local to this Desktop, desktop and
pointer state, flat public uploads, and unrestricted server-side Fetch.
`system.appearance.snapshot()` reads complete unresolved authoritative state.
`system.desktopPreferences.snapshot()` reads the complete effective
`{ theme, animations }` state. Its updates may set either preference explicitly
or use `"default"` to resume following the native environment. Both capabilities
expose ordinary live-only `change` subscriptions with no initial replay. A
Client cannot write authoritative Appearance or discover system-wide Programs
and Processes.

`system.uploads` has the same flat contract as the Server SDK. It writes a
value, then reads or describes it using exactly one opaque generated file key;
it exposes no filesystem path, path segments, listing, deletion, or clearing.

Desktop and pointer access are independent objects rather than events merged
into System:

```ts
const desktop = await system.desktop.size()
const stopDesktop = system.desktop.subscribe("resize", next => undefined)

const position = await system.pointer.position()
const stopPointer = system.pointer.subscribe("move", next => undefined)
```

The desktop size is the complete desktop area containing this Client,
independent of the Client Window's layer. Client code cannot select a layer,
and the desktop's gutter never enters an endpoint. Pointer position and
movement both require the `pointer` permission. Reads are asynchronous
requests; subscriptions receive only future publications and never replay a
retained value.

Permission decisions belong to the current Program, not to the desktop System.
They are available from a Program handle and flattened through `context` as the
same canonical capability:

```ts
const program = await context.program()

await program.permission.granted("pointer")
await context.permission.request("pointer")
await context.permission.timeout(5_000).request("pointer")

context.permission === program.permission
```

`granted()` reads the effective decision without prompting. `request()` asks
only when no known decision can answer immediately and returns `null` if its
deadline expires. The desktop remains the internal enforcement boundary, but
permission ownership does not alter the public shape of `system`.

The Client System exposes only direct, exact Service handles. Creating a handle
does not read or start the Service and exposes no Service registry:

```ts
const service = system.service({
  program: "counter",
  endpoint: "server",
  name: "state"
})

await service.waitReady()
if (await service.enabled()) await service.ask("value")

service.subscribe("changed", message => console.log(message))
service.lifecycle.subscribe("disable", () => console.log("unavailable"))
```

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

`Context` combines communication with navigation into the executing Client's
Process. The paired Server is explicitly named as
`context.server`; its publishing, asking, existence, readiness, start, and stop
operations never masquerade as properties of `context`. `context.stop()` stops
the executing Client, while complete Process exit remains available only
through `context.process()`. It is the canonical Process-owned handle, so
`context.server === (await context.process()).server`.
Endpoint `process()` navigation is asynchronous; contextual ownership is
requested only when navigation needs it and then retained by the SDK.
`context.name()` returns that retained Process's Program-local name, or `null`
when its launch was unnamed.

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
import { system, context } from "@phreshos/client"
```

It also re-exports the shared Core runtime classes—`Program`, `Process`,
`Endpoint`, `Server`, and `Client`—and refines the handles returned through
them. These are the same domain classes used by the Server SDK, so
`instanceof Server` and `instanceof Client` retain one meaning. `Window`, like
`ClientTraffic`, is a type-only capability owned by Client and has no
independent `instanceof` identity.

The executing Client's communication belongs directly to `context`. Its
subscription tools receive events addressed to this Client, while `publish()`
emits outward from this Client without choosing a destination. Existence and
readiness belong to `context.server`; the current Client stops through
`context.stop()`, and explicit Endpoint handles expose their own
`endpoint.lifecycle` subscriptions.

An Endpoint handle is also a selective source: `endpoint.subscribe()` follows
destinationless events emitted by that Endpoint. Its `traffic` property remains
reserved for directed publications, questions, and answers.

Messages sent by an Endpoint in the same Program contain that real Endpoint in
`from`. If the sender belongs to another Program, `from` is `null`; the foreign
identity is removed by the authoritative System before the message reaches the desktop.
The same rule applies to Client-visible traffic destinations.

Client-visible Program handles can operate only within their own Program.
They deliberately omit `install()` and `fork()`, and their `Storage` values never
expose native filesystem paths. Every Client-side Window handle exposes the same
authoritative, subscribable Window capability and its `window.local` physical
representation on this desktop. Local reads and updates have no events and do
not change Server state. `context.window` is only convenient access to the
executing Client's canonical Window; it has no additional authority.

A Client may uninstall only its own Program. The operation is an async
generator so a declared Server cleanup command remains observable without a
fixed answer timeout:

```ts
for await (const chunk of program.uninstall()) {
  console.log(chunk.stream, chunk.text)
}
```

A Program may converge its Clients on one named Process without a manual
`find()`/`create()` race:

```ts
const shared = await program.process.findOrCreate({
  name: "shared-server",
  server: true,
  client: false
})
```

The authoritative Core returns the existing Process only when its normalized
launch is equivalent; a conflicting launch rejects without changing it.

When both dimensions must change, `setGeometry({ position, size })` commits
them through one authoritative request and produces one `geometry` event.
Calling `move()` and `resize()` sequentially or through `Promise.all()` remains
two independent operations and can expose an intermediate state remotely.

An `under` or `over` representation may request one local system-rendered Surface:

```ts
await context.window.local.surface.set({ duration: 240, easing: "ease-out", wait: true })

await context.window.local.surface.remove({ duration: 180, easing: "ease-in" })
```

The desktop holds local state only for the lifetime of that iframe
representation. Reloading or destroying it resets the representation from
authoritative truth, while other desktops remain unaffected. Program code may
synchronize desired presence through its Server and explicitly apply it
again. `set()` and `remove()` accept only a required `VisibilityTransition`;
Programs cannot configure the System Surface's material, opacity, or radius.
The transition uses milliseconds and a stable named or cubic Bézier easing;
the desktop performs the motion, honors reduced motion, and removes the Surface
only after its exit transition completes. `wait: true` makes the request settle
with that transition. A new iframe representation restores nothing. The
container follows the iframe geometry while the independently rounded Surface
neither clips nor masks Client content. The ordinary `window` layer rejects
the capability.

`program.icon()` requests the current Program's guaranteed PNG `Blob` on
demand. The desktop derives the Program from the calling frame; no identity,
private asset address, or filesystem path crosses from Client code.

Persistent startup is deliberately absent. Only a Server endpoint may change
whether an installed Program creates a Process when the system starts.
