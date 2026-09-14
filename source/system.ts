import {
  parseShellEvent,
  type ClientService,
  type ProgramDefinition,
  type ServerService,
  type ServiceKey,
  type ShellOptions,
  type System as CoreSystem,
  type SystemProcess as CoreSystemProcess,
  type SystemProcessEvents,
  type SystemProgram as CoreSystemProgram,
  type SystemProgramEvents,
  type WritableAppearance
} from "@phreshos/core"
import ClientAppearance from "./appearance.js"
import wire from "./wire.js"
import { prepareService } from "./service.js"
import { uploads } from "./uploads.js"
import Events from "./events.js"
import { exit, process, program, type ProcessRecord, type ProgramRecord } from "./domain.js"
import { systemStorage } from "./storage.js"
import network from "./network.js"

type ServiceEndpoint = ServiceKey["endpoint"]

type ServiceAddress<Endpoint extends ServiceEndpoint> = Omit<ServiceKey, "endpoint"> & Readonly<{
  endpoint: Endpoint
}>

type ServiceHandle<Endpoint extends ServiceEndpoint, Events extends object, Fallback = unknown> = Endpoint extends "server"
  ? ServerService<Events, Fallback>
  : ClientService<Events, Fallback>

class ClientSystem implements CoreSystem {
  public readonly storage = systemStorage()
  public readonly appearance: WritableAppearance = new ClientAppearance()
  public readonly program: CoreSystemProgram = new SystemProgramHandle()
  public readonly process: CoreSystemProcess = new SystemProcessHandle()
  public readonly uploads = uploads
  public readonly network = network

  public service<Endpoint extends ServiceEndpoint>(key: ServiceAddress<Endpoint>): ServiceHandle<Endpoint, {}>
  public service<ServiceEvents extends object, Fallback = unknown>(key: ServiceAddress<"server">): ServerService<ServiceEvents, Fallback>
  public service<ServiceEvents extends object, Fallback = unknown>(key: ServiceAddress<"client">): ClientService<ServiceEvents, Fallback>
  public service(key: ServiceKey): unknown { return prepareService(key) }

  public async *shell(command: string, options: ShellOptions = {}) {
    const { signal, ...settings } = options

    for await (const event of wire.stream(["shell", command, settings], undefined, signal)) yield parseShellEvent(event)
  }

}

class SystemProgramHandle extends Events<SystemProgramEvents, never> implements CoreSystemProgram {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-program", event, (...values) => listener(systemProgramEvent(event, values)), null, impossible),
      observer => wire.onAll("host-program", (event, ...values) => {
        if (typeof event === "string") observer(event, systemProgramEvent(event, values))
      })
    )
  }

  public async list(onlyInstalled = false) {
    const answer = await wire.request(["host-program-list", onlyInstalled]) as [ProgramRecord[]]
    return answer[0].map(program)
  }

  public async find(identity: string) {
    const answer = await wire.request(["host-program-find", identity]) as [ProgramRecord | null]
    return answer[0] ? program(answer[0]) : null
  }

  public async create(source: ProgramDefinition | string) {
    const answer = await wire.request(["host-program-create", source]) as [ProgramRecord]
    return program(answer[0])
  }

  public async forceCreate(source: ProgramDefinition | string) {
    const answer = await wire.request(["host-program-force-create", source]) as [ProgramRecord]
    return program(answer[0])
  }
}

class SystemProcessHandle extends Events<SystemProcessEvents, never> implements CoreSystemProcess {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-process", event, (...values) => listener(systemProcessEvent(event, values)), null, impossible),
      observer => wire.onAll("host-process", (event, ...values) => {
        if (typeof event === "string") observer(event, systemProcessEvent(event, values))
      })
    )
  }

  public async list() {
    const answer = await wire.request(["host-process-list"]) as [ProcessRecord[]]
    return answer[0].map(record => process(record))
  }

  public async find(identity: string) {
    const answer = await wire.request(["host-process-find", identity]) as [ProcessRecord | null]
    return answer[0] ? process(answer[0]) : null
  }
}

function systemProcessEvent(event: string, values: unknown[]): unknown {
  if (event === "create") return process(values[1])
  if (event === "exit") return { process: process(values[1]), ...exit(values[2], values[3]) }
  return values[0]
}

function systemProgramEvent(event: string, values: unknown[]): unknown {
  if (event === "create" || event === "forget" || event === "install") return program(values[1])
  if (event === "uninstall") return { program: program(values[1]), purge: values[2] === true }
  return values[0]
}

/** The global System represented through this Client runtime. */
export const system: CoreSystem = new ClientSystem()
