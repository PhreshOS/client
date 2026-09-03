import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import manifest from "../package.json" with { type: "json" }

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const temporary = mkdtempSync(join(tmpdir(), "phreshos-client-package-"))
const cache = join(temporary, "npm-cache")

assert.equal(
  manifest.peerDependencies["@phreshos/core"],
  manifest.devDependencies["@phreshos/core"],
  "the published Core peer must match the verified Core dependency"
)

try {
  const output = execFileSync(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    {
      cwd: repository,
      encoding: "utf8",
      env: { ...process.env, npm_config_cache: cache }
    }
  )
  const packed = JSON.parse(output)[0]
  const paths = new Set(packed.files.map(file => file.path))

  assert(paths.has("dist/main.js"), "the package has no JavaScript entry point")
  assert(paths.has("dist/main.d.ts"), "the package has no declaration entry point")
  assert(paths.has("LICENSE"), "the package has no license")
  assert(paths.has("README.md"), "the package has no README")
  assert(paths.has("package.json"), "the package has no manifest")

  for (const path of paths) {
    assert(
      path === "LICENSE" || path === "README.md" || path === "package.json" || path.startsWith("dist/"),
      `private repository material entered the package: ${path}`
    )
  }

  const consumer = join(temporary, "consumer")
  const archive = join(temporary, packed.filename)

  mkdirSync(consumer)
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }, null, 2)
  )
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      archive,
      `@phreshos/core@${manifest.devDependencies["@phreshos/core"]}`
    ],
    {
      cwd: consumer,
      stdio: "inherit",
      env: { ...process.env, npm_config_cache: cache }
    }
  )

  writeFileSync(
    join(consumer, "runtime.mjs"),
    `import assert from "node:assert/strict"
import * as core from "@phreshos/core"

const messages = []
const parent = { postMessage: message => messages.push(message) }
globalThis.window = { parent, addEventListener() {} }

const sdk = await import("@phreshos/client")
const { ClientEndpoint, ClientService, Endpoint, Process, Program, ServerEndpoint, ServerService, Service, context, desktop, system } = sdk

assert.equal(Program, core.Program)
assert.equal(Process, core.Process)
assert.equal(Endpoint, core.Endpoint)
assert.equal(ServerEndpoint, core.ServerEndpoint)
assert.equal(ClientEndpoint, core.ClientEndpoint)
assert.equal("current" in sdk, false)
assert.equal(typeof context.process, "function")
assert.equal(typeof context.name, "function")
assert.equal(typeof context.localWindow, "object")
assert.equal(typeof context.isService, "function")
assert.equal("channel" in context, false)
assert.equal(typeof context.server.isService, "function")
assert.equal(typeof context.server.waitReady, "function")
assert.equal(typeof desktop.preferences.snapshot, "function")
assert.equal(typeof desktop.preferences.update, "function")
assert.equal(typeof system.appearance.snapshot, "function")
assert.equal(typeof system.shell, "function")
assert.equal(typeof system.uploads.write, "function")
assert.equal(typeof system.uploads.stream, "function")
assert.equal(typeof system.uploads.stat, "function")
assert.equal("serve" in system, false)
assert.equal(typeof desktop.surface.snapshot, "function")
assert.equal("desktopPreferences" in system, false)
assert.equal("pointer" in system, false)
assert.equal(typeof context.localWindow.addSurface, "function")
assert.equal(typeof context.localWindow.removeSurface, "function")
assert.equal(typeof context.localWindow.transaction, "function")
assert.equal("subscribe" in context.localWindow, false)
assert.equal(typeof context.permissions.get, "function")
assert.equal(typeof context.permissions.request, "function")
assert.equal(typeof context.permissions.timeout, "function")
const service = system.service({ program: "counter", process: "main", endpoint: "server" })
const clientService = system.service({ program: "counter", process: "main", endpoint: "client" })
const exactService = system.service({ process: "1f4b222c-25d7-4ba8-85e5-d5e59cfe0928", endpoint: "server" })
assert.equal(service, system.service({ program: "counter", process: "main", endpoint: "server" }))
assert.equal(clientService, system.service({ program: "counter", process: "main", endpoint: "client" }))
assert.equal(exactService, system.service({ process: "1f4b222c-25d7-4ba8-85e5-d5e59cfe0928", endpoint: "server" }))
assert.throws(() => system.service({ process: "main", endpoint: "server" }), /complete service key/)
assert(service instanceof Service)
assert(service instanceof ServerService)
assert(clientService instanceof Service)
assert(clientService instanceof ClientService)
assert.equal("program" in service, false)
assert.equal("endpoint" in service, false)
assert.equal(typeof service.exists, "function")
assert.equal(typeof service.waitReady, "function")
assert.equal(typeof clientService.waitReady, "function")
assert.equal(typeof clientService.publish, "function")
assert.equal(typeof service.subscribe, "function")
assert.equal(typeof service.lifecycle.subscribe, "function")
assert.equal("channel" in service, false)
assert.equal("docs" in service, false)
assert.equal(messages.length, 0)
`
  )
  execFileSync(process.execPath, [join(consumer, "runtime.mjs")], {
    cwd: consumer,
    stdio: "inherit"
  })

  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { context, desktop, system, ClientEndpoint, ServerEndpoint, type Appearance, type ClientService, type Desktop, type DesktopPreferences, type DesktopSurfaceSnapshot, type PermissionChange, type ServerService, type SystemUploads, type Upload } from "@phreshos/client"
// @ts-expect-error the runtime object is named context
import { current } from "@phreshos/client"

type CounterEvents = { change: number }

const appearance: Promise<Appearance> = system.appearance.snapshot()
const shell: AsyncGenerator<import("@phreshos/client").ShellEvent, void, void> = system.shell("printf hello", { signal: new AbortController().signal })
const uploads: SystemUploads = system.uploads
const upload: Promise<Upload> = uploads.write("hello")
const uploadText: Promise<string> = uploads.text("00000000-0000-0000-0000-000000000000.txt")
const preferences: Promise<DesktopPreferences> = desktop.preferences.snapshot()
const updatePreferences: Promise<void> = desktop.preferences.update({ theme: "default", animations: false })
const clientDesktop: Desktop = desktop
const desktopSurface: Promise<DesktopSurfaceSnapshot> = desktop.surface.snapshot()
const counter: ServerService<CounterEvents> = system.service<CounterEvents>({ program: "counter", process: "main", endpoint: "server" })
const clientCounter: ClientService<CounterEvents> = system.service<CounterEvents>({ program: "counter", process: "main", endpoint: "client" })
const inferredClientCounter: ClientService = system.service({ program: "counter", process: "main", endpoint: "client" })
const exactCounter: ServerService = system.service({ process: "1f4b222c-25d7-4ba8-85e5-d5e59cfe0928", endpoint: "server" })
const counterStop = counter.subscribe("change", value => void value)
const counterLifecycleStop = counter.lifecycle.subscribe("start", () => undefined)
const counterAnswer: Promise<number> = counter.ask<number>("value")
const serviceRole: Promise<boolean> = context.isService()
const processName: Promise<string | null> = context.name()
const currentProcess = await context.process()
const sharedProcess: import("@phreshos/core").Process = currentProcess
const program = await context.program()
const hasAgent: boolean = program.hasAgent
const agent: Promise<string | null> = program.agent()
const storedPermission = program.permissions.get("files")
const permissions = program.permissions.all()
const assignedPermission: Promise<PermissionChange> = program.permissions.set("files", true)
const removedPermission: Promise<PermissionChange> = program.permissions.delete("files")
const requestedPermission: Promise<PermissionChange> = context.permissions.request("files", ["read"])
const timedPermission: Promise<PermissionChange> = context.permissions.timeout(120_000).request("environment")
const desktopStop = desktop.surface.subscribe("resize", snapshot => void snapshot.size.width)
const clientSurface: Promise<void> = context.localWindow.transaction({ easing: "ease-out", wait: true }).addSurface()
const localGeometry: Promise<void> = context.localWindow.transaction({ duration: 180 }).setGeometry({
  position: { x: 20, y: 20 },
  size: { width: 420, height: 280 }
})
const geometry: Promise<void> = context.localWindow.setGeometry({
  position: { x: "0/1", y: "0/1" },
  size: { width: "1/2", height: "1/2" }
})
const server: ServerEndpoint = context.server
void context.process().then(process => {
  const client: ClientEndpoint | null = process.client
  if (client) {
    void client.start({ title: "Prepared title" })
    void client.window.position()
  }
  void process.server.start({ service: true })
  void client
})
void context.program().then(program => {
  const shared: Promise<import("@phreshos/client").Process> = program.process.findOrCreate({
    name: "shared-server",
    server: { service: true },
    client: false
  })
  void shared
})
void localGeometry
void shell

void preferences
void updatePreferences
void upload
void uploadText
void clientDesktop
void desktopSurface
void counter
void clientCounter
void inferredClientCounter
void exactCounter
void counterStop
void counterLifecycleStop
void counterAnswer
void serviceRole
void processName
void sharedProcess
void hasAgent
void agent
void storedPermission
void permissions
void assignedPermission
void removedPermission
void requestedPermission
void timedPermission
void desktopStop
void clientSurface
void geometry
void server
`
  )
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["DOM", "ESNext"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ESNext"
        },
        include: ["consumer.ts"]
      },
      null,
      2
    )
  )

  const typescript = resolve(repository, "node_modules/typescript/bin/tsc")
  assert(readFileSync(typescript).length > 0, "TypeScript is not installed")
  execFileSync(process.execPath, [typescript, "-p", join(consumer, "tsconfig.json")], {
    cwd: consumer,
    stdio: "inherit"
  })
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
