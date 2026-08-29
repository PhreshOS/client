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

const { Client, Endpoint, Process, Program, Server, ServerServiceHandler, ServiceHandler, current, system } = await import("@phreshos/client")

assert.equal(Program, core.Program)
assert.equal(Process, core.Process)
assert.equal(Endpoint, core.Endpoint)
assert.equal(Server, core.Server)
assert.equal(Client, core.Client)
assert.equal(typeof current.process, "function")
assert.equal(typeof current.window, "object")
assert.equal(typeof current.window.local, "object")
assert.equal("localWindow" in current, false)
assert.equal(typeof current.enableService, "function")
assert.equal(typeof current.disableService, "function")
assert.equal("enableService" in current.server, false)
assert.equal("disableService" in current.server, false)
assert.equal(typeof system.desktopPreferences.snapshot, "function")
assert.equal(typeof system.desktopPreferences.update, "function")
assert.equal(typeof system.appearance.snapshot, "function")
assert.equal(typeof system.uploads.write, "function")
assert.equal(typeof system.uploads.stream, "function")
assert.equal(typeof system.uploads.stat, "function")
assert.equal("serve" in system, false)
assert.equal(typeof system.desktop.size, "function")
assert.equal("surface" in system, false)
assert.equal(typeof system.pointer.position, "function")
assert.equal(typeof current.window.local.surface.set, "function")
assert.equal(typeof current.window.local.surface.remove, "function")
assert.equal("snapshot" in current.window.local.surface, false)
assert.equal("subscribe" in current.window.local, false)
assert.equal(typeof current.permission.granted, "function")
assert.equal(typeof current.permission.request, "function")
assert.equal("permission" in system, false)
const service = system.service({ program: "counter", endpoint: "server", name: "state" })
assert.equal(service, system.service({ program: "counter", endpoint: "server", name: "state" }))
assert(service instanceof ServiceHandler)
assert(service instanceof ServerServiceHandler)
assert.equal("program" in service, false)
assert.equal("endpoint" in service, false)
assert.equal(typeof service.enabled, "function")
assert.equal(typeof service.waitReady, "function")
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
    `import { current, system, Client, Server, type Appearance, type ClientServiceHandler, type DesktopPreferences, type DesktopSize, type SystemDesktop, type ServerServiceHandler, type SystemUploads, type Upload } from "@phreshos/client"

type CounterEvents = { change: number }

const appearance: Promise<Appearance> = system.appearance.snapshot()
const uploads: SystemUploads = system.uploads
const upload: Promise<Upload> = uploads.write("hello")
const uploadText: Promise<string> = uploads.text("00000000-0000-0000-0000-000000000000.txt")
const preferences: Promise<DesktopPreferences> = system.desktopPreferences.snapshot()
const updatePreferences: Promise<void> = system.desktopPreferences.update({ theme: "default", animations: false })
const systemDesktop: SystemDesktop = system.desktop
const desktopSize: Promise<DesktopSize> = system.desktop.size()
const counter: ServerServiceHandler<CounterEvents> = system.service<CounterEvents>({ program: "counter", endpoint: "server", name: "state" })
const clientCounter: ClientServiceHandler<CounterEvents> = system.service<CounterEvents>({ program: "counter", endpoint: "client", name: "state" })
const inferredClientCounter: ClientServiceHandler = system.service({ program: "counter", endpoint: "client", name: "state" })
const counterStop = counter.channel.subscribe("change", value => void value)
const counterAnswer: Promise<number> = counter.channel.ask<number>("value")
const expose: Promise<void> = current.enableService("state")
const program = await current.program()
const hasAgent: boolean = program.hasAgent
const agent: Promise<string | null> = program.agent()
const desktop = system.desktop.subscribe("resize", size => void size.width)
const pointer = system.pointer.subscribe("move", position => void position.x)
const clientSurface: Promise<void> = current.window.local.surface.set({ easing: "ease-out", wait: true })
const localGeometry: Promise<void> = current.window.local.setGeometry({
  position: { x: 20, y: 20 },
  size: { width: 420, height: 280 }
}, { duration: 180 })
const geometry: Promise<void> = current.window.setGeometry({
  position: { x: "0/1", y: "0/1" },
  size: { width: "1/2", height: "1/2" }
})
const permission: Promise<boolean | null> = current.permission.request("pointer")
const server: Server = current.server
void current.process().then(process => {
  const client: Client | null = process.client
  if (client) {
    void client.start({ title: "Prepared title" })
    void client.window.local.position()
  }
  void client
})
void current.program().then(program => {
  const samePermission: typeof current.permission = program.permission
  void samePermission.granted("pointer")
  const shared: Promise<import("@phreshos/client").Process> = program.process.findOrCreate({
    name: "shared-server",
    server: true,
    client: false
  })
  void shared
})
void localGeometry

void preferences
void updatePreferences
void upload
void uploadText
void systemDesktop
void desktopSize
void counter
void clientCounter
void inferredClientCounter
void counterStop
void counterAnswer
void expose
void hasAgent
void agent
void desktop
void pointer
void clientSurface
void geometry
void permission
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
