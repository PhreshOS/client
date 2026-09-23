import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import manifest from "../package.json" with { type: "json" }
import { test } from "vitest"

test("package contract", async () => {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const temporary = mkdtempSync(join(tmpdir(), "phreshos-client-package-"))
  const cache = join(temporary, "npm-cache")
  const coreCandidate = process.env.PHRESHOS_CORE_PACKAGE
  const corePackage = `@phreshos/core@${manifest.devDependencies["@phreshos/core"]}`

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
        coreCandidate ?? corePackage
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
  const { context, desktop, system } = sdk
  const { ClientEndpoint, ClientService, Endpoint, Process, Program, ServerEndpoint, ServerService, Service } = core

  assert.deepEqual(Object.keys(sdk).sort(), ["context", "desktop", "system"])
  for (const shared of ["Program", "Process", "Endpoint", "ServerEndpoint", "ClientEndpoint", "Service", "ServerService", "ClientService"]) {
    assert.equal(shared in sdk, false)
  }
  assert.equal("current" in sdk, false)
  assert.equal(typeof context.process, "function")
  assert.equal(typeof context.name, "function")
  assert.equal(typeof context.window, "object")
  assert.equal(typeof context.presentation, "object")
  assert.equal(typeof context.isService, "function")
  assert.equal("channel" in context, false)
  assert.equal(typeof context.server.isService, "function")
  assert.equal(typeof context.server.waitReady, "function")
  assert.equal(typeof desktop.preferences.snapshot, "function")
  assert.equal(typeof desktop.preferences.update, "function")
  assert.equal(typeof system.appearance.snapshot, "function")
  assert.equal(typeof system.program.forceCreate, "function")
  assert.equal(typeof system.authentication.state, "function")
  assert.equal(typeof system.authentication.setCredentials, "function")
  assert.equal(typeof system.authentication.signOutAllSessions, "function")
  assert.equal("forceCreateProgram" in system, false)
  assert.equal(typeof system.network.websocket, "function")
  assert.equal(typeof system.network.fetch, "function")
  assert.equal("fetch" in system, false)
  assert.equal("websocket" in system, false)
  assert.equal(typeof system.shell, "function")
  assert.equal(typeof system.uploads.write, "function")
  assert.equal(typeof system.uploads.path, "function")
  assert.equal(typeof system.uploads.stream, "function")
  assert.equal(typeof system.uploads.stat, "function")
  assert.equal(typeof system.storage.file, "function")
  assert.equal(typeof system.storage.navigate, "function")
  assert.equal("serve" in system, false)
  assert.equal(typeof desktop.viewport.snapshot, "function")
  assert.equal("desktopPreferences" in system, false)
  assert.equal("pointer" in system, false)
  assert.equal(typeof context.presentation.setSurface, "function")
  assert.equal(typeof context.presentation.minimize, "function")
  assert.equal(typeof context.presentation.maximize, "function")
  assert.equal(typeof context.presentation.setTitle, "function")
  assert.equal(typeof context.presentation.raise, "function")
  assert.equal(typeof context.presentation.transaction, "function")
  assert.equal(typeof context.presentation.transactionAndWait, "function")
  assert.equal(typeof context.presentation.subscribe, "function")
  assert.equal(typeof context.permissions.get, "function")
  assert.equal(typeof context.permissions.request, "function")
  assert.equal(typeof context.permissions.timeout, "function")
  const service = system.service.prepare({ program: "counter", process: "main", endpoint: "server" })
  const clientService = system.service.prepare({ program: "counter", process: "main", endpoint: "client" })
  assert.equal(service, system.service.prepare({ program: "counter", process: "main", endpoint: "server" }))
  assert.equal(clientService, system.service.prepare({ program: "counter", process: "main", endpoint: "client" }))
  assert.throws(() => system.service.prepare({ process: "main", endpoint: "server" }), /complete Service address/)
  assert(service instanceof Service)
  assert(service instanceof ServerService)
  assert(clientService instanceof Service)
  assert(clientService instanceof ClientService)
  assert.deepEqual(service.address(), { program: "counter", process: "main", endpoint: "server" })
  assert.equal(typeof service.available, "function")
  assert.equal(typeof service.programMetadata, "function")
  assert.equal(typeof service.programIcon, "function")
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
      `import { context, desktop, system } from "@phreshos/client"
  import { ClientEndpoint, ServerEndpoint, type Appearance, type ClientService, type Connection, type Desktop, type DesktopPreferences, type DesktopViewportSnapshot, type FileStat, type Permission, type Process, type Program as CoreProgram, type ServerService, type ShellEvent, type Storage, type StorageFile, type SystemUploads, type Upload, type Window, type WritableContent } from "@phreshos/core"
  // @ts-expect-error the runtime object is named context
  import { current } from "@phreshos/client"
  // @ts-expect-error shared domains are imported from Core, not republished by an environment SDK
  import { Program } from "@phreshos/client"

  type CounterEvents = { change: number }

  const appearance: Promise<Appearance> = system.appearance.snapshot()
  const appearanceUpdate: Promise<void> = system.appearance.update({ colors: { dark: { danger: "#ff0000" } } })
  const authenticationState: Promise<import("@phreshos/core").AuthenticationState> = system.authentication.state()
  const authenticationConnections: Promise<Connection[]> = system.authentication.connections()
  const shell: AsyncGenerator<ShellEvent, void, void> = system.shell("printf hello", { signal: new AbortController().signal })
  const uploads: SystemUploads = system.uploads
  const uploadsPath: Promise<string> = uploads.path()
  const upload: Promise<Upload> = uploads.write("hello")
  const uploadStat: Promise<FileStat | null> = uploads.stat("00000000-0000-0000-0000-000000000000.txt")
  const uploadContent: WritableContent = new DataView(new ArrayBuffer(4))
  const uploadText: Promise<string> = uploads.text("00000000-0000-0000-0000-000000000000.txt")
  const storage: Storage = system.storage.navigate("Documents")
  const storageFile: StorageFile = storage.file("example.txt")
  const storageText: Promise<string> = storageFile.text()
  const preferences: Promise<DesktopPreferences> = desktop.preferences.snapshot()
  const desktopScale: Promise<number> = preferences.then(value => value.scale)
  const updatePreferences: Promise<void> = desktop.preferences.update({ theme: "default", animations: false, scale: 1.25 })
  const resetScale: Promise<void> = desktop.preferences.update({ scale: "default" })
  const clientDesktop: Desktop = desktop
  const desktopViewport: Promise<DesktopViewportSnapshot> = desktop.viewport.snapshot()
  const desktopConnection: Promise<Connection> = desktop.connection()
  const counter: ServerService<CounterEvents> = system.service.prepare<CounterEvents>({ program: "counter", process: "main", endpoint: "server" })
  const clientCounter: ClientService<CounterEvents> = system.service.prepare<CounterEvents>({ program: "counter", process: "main", endpoint: "client" })
  const inferredClientCounter: ClientService = system.service.prepare({ program: "counter", process: "main", endpoint: "client" })
  const forcedProgram: Promise<CoreProgram> = system.program.forceCreate("./phresh.config.ts")
  // @ts-expect-error Program creation belongs to the Program capability
  system.forceCreateProgram("./phresh.config.ts")
  const counterStop = counter.subscribe("change", value => void value)
  const counterLifecycleStop = counter.lifecycle.subscribe("available", () => undefined)
  const counterAnswer: Promise<number> = counter.ask<number>("value")
  const serviceRole: Promise<boolean> = context.isService()
  const processName: Promise<string | null> = context.name()
  const currentProcess = await context.process()
  const currentWindow: Window = context.window
  const sharedProcess: import("@phreshos/core").Process = currentProcess
  const program = await context.program()
  const hasAgent: boolean = program.hasAgent
  const agent: Promise<string | null> = program.agent()
  const definition = program.definition()
  const serviceMetadata = counter.programMetadata()
  const serviceIcon = counter.programIcon("small")
  const storedPermission = program.permissions.get("all")
  const permissions = program.permissions.all()
  const storedAllows: Promise<boolean> = program.permissions.allows("network", ["https://api.example.com"])
  const allowedPermission: Promise<void> = program.permissions.allow("all")
  const deniedPermission: Promise<void> = program.permissions.deny("all")
  const delegatedPermission: Promise<Permission<"all">> = program.permissions.request("all")
  // @ts-expect-error Permission assignments are replaced or explicitly denied; they are never deleted.
  program.permissions.delete("all")
  // @ts-expect-error permissions belong to the Program, never one Process
  currentProcess.permissions
  const effectiveAllows: Promise<boolean> = context.permissions.allows("network", ["https://api.example.com"])
  const requestedPermission: Promise<Permission<"all">> = context.permissions.request("all", [])
  const timedPermission: Promise<Permission<"all">> = context.permissions.timeout(120_000).request("all")
  // @ts-expect-error permission names are closed by the Core catalog
  context.permissions.get("files")
  // @ts-expect-error a value-less permission accepts no string values
  context.permissions.request("all", ["read"])
  const desktopStop = desktop.viewport.subscribe("resize", snapshot => void snapshot.size.width)
  const windowStop = context.window.subscribe("move", position => void position.x)
  const windowPosition = context.window.position()
  const clientSurface: Promise<void> = context.presentation.transactionAndWait({ duration: 120, easing: "ease-out" }).setSurface(true)
  const minimized: Promise<void> = context.presentation.transaction({ duration: 120, easing: "ease-out" }).minimize()
  const raised: Promise<void> = context.presentation.raise()
  const followed: Promise<void> = context.presentation.transaction({ duration: 120, easing: "ease-out" }).follow()
  const unfollowed: Promise<void> = context.presentation.unfollow()
  const localGeometry: Promise<void> = context.presentation.transaction({ duration: 180, easing: "ease-out" }).setGeometry({
    x: 20,
    y: 20,
    width: 420,
    height: 280
  })
  const geometry: Promise<void> = context.presentation.setGeometry({
    x: "0/1",
    y: "0/1",
    width: "1/2",
    height: "1/2"
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
    const shared: Promise<Process> = program.findOrCreateProcess({
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
  void desktopScale
  void resetScale
  void clientDesktop
  void desktopViewport
  void desktopConnection
  void counter
  void clientCounter
  void inferredClientCounter
  void counterStop
  void counterLifecycleStop
  void counterAnswer
  void serviceRole
  void currentWindow
  void processName
  void sharedProcess
  void hasAgent
  void agent
  void storedPermission
  void permissions
  void storedAllows
  void allowedPermission
  void deniedPermission
  void delegatedPermission
  void effectiveAllows
  void requestedPermission
  void timedPermission
  void desktopStop
  void windowStop
  void windowPosition
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
}, 120_000)
