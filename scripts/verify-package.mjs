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
import { decode } from "@msgpack/msgpack"

const messages = []
const parent = { postMessage: message => messages.push(message) }
globalThis.window = { parent, addEventListener() {} }

const { Client, Endpoint, Process, Program, Server, ServerServiceHandler, ServiceHandler, current, host } = await import("@phreshos/client")

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
assert.equal(typeof host.theme.snapshot, "function")
assert.equal(typeof host.desktop.size, "function")
assert.equal("surface" in host, false)
assert.equal(typeof host.pointer.position, "function")
assert.equal(typeof current.window.local.surface.set, "function")
assert.equal(typeof current.window.local.surface.remove, "function")
assert.equal("snapshot" in current.window.local.surface, false)
assert.equal("subscribe" in current.window.local, false)
assert.equal(typeof current.permissions.granted, "function")
assert.equal(typeof current.permissions.request, "function")
assert.equal("permissions" in host, false)
const service = host.service({ program: "counter", endpoint: "server", name: "state" })
assert.equal(service, host.service({ program: "counter", endpoint: "server", name: "state" }))
assert(service instanceof ServiceHandler)
assert(service instanceof ServerServiceHandler)
assert.equal(typeof service.docs, "function")
assert.equal(messages.length, 1)
assert(messages[0][0] instanceof Uint8Array)
assert.equal(messages[0].length, 1)
const [route, operation, document] = decode(messages[0][0])
assert.equal(route, "boundary")
assert.equal(operation, "document")
assert.equal(typeof document, "string")
`
  )
  execFileSync(process.execPath, [join(consumer, "runtime.mjs")], {
    cwd: consumer,
    stdio: "inherit"
  })

  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { current, host, Client, Server, type DesktopSize, type HostDesktop, type ServerServiceHandler, type ThemeProperties } from "@phreshos/client"

type CounterEvents = { change: number }

const theme: Promise<Readonly<ThemeProperties>> = host.theme.snapshot()
const hostDesktop: HostDesktop = host.desktop
const desktopSize: Promise<DesktopSize> = host.desktop.size()
const counter: ServerServiceHandler<CounterEvents> = host.service<CounterEvents>({ program: "counter", endpoint: "server", name: "state" })
const counterStop = counter.channel.subscribe("change", value => void value)
const counterAnswer: Promise<number> = counter.channel.ask<number>("value")
const counterDocs: Promise<string | null> = counter.docs()
const expose: Promise<void> = current.enableService({ name: "state" })
const desktop = host.desktop.subscribe("resize", size => void size.width)
const pointer = host.pointer.subscribe("move", position => void position.x)
const clientSurface: Promise<void> = current.window.local.surface.set({ opacity: 0.5 }, { easing: "ease-out", wait: true })
const localGeometry: Promise<void> = current.window.local.setGeometry({
  position: { x: 20, y: 20 },
  size: { width: 420, height: 280 }
}, { duration: 180 })
const geometry: Promise<void> = current.window.setGeometry({
  position: { x: "0/1", y: "0/1" },
  size: { width: "1/2", height: "1/2" }
})
const permission: Promise<boolean | null> = current.permissions.request("pointer")
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
  const samePermissions: typeof current.permissions = program.permissions
  void samePermissions.granted("pointer")
})
void localGeometry

void theme
void hostDesktop
void desktopSize
void counter
void counterStop
void counterAnswer
void counterDocs
void expose
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
