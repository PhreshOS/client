import type {
  ContextPermissions,
  PermissionInput,
  PermissionAssignments,
  PermissionName,
  PermissionRequest,
  ProcessPermissions,
  ProgramPermissions,
  TimedContextPermissions
} from "@phreshos/core"
import { parsePermission, parsePermissionChange, parsePermissions } from "@phreshos/core"
import type { HandleAddress } from "./domain.js"
import wire from "./wire.js"

export const defaultPermissionTimeout = 120_000

/** Bind authoritative stored grants to one exact Program handle. */
export function programPermissions(program: HandleAddress): ProgramPermissions {
  return assignedPermissions("program-permissions", program)
}

/** Bind temporary grants to one exact Process handle. */
export function processPermissions(process: HandleAddress): ProcessPermissions {
  return assignedPermissions("process-permissions", process)
}

function assignedPermissions(word: "program-permissions" | "process-permissions", subject: HandleAddress): PermissionAssignments {
  const operate = <Name extends PermissionName>(operation: "all" | "get" | "allows" | "set" | "delete", name?: Name, permission?: PermissionInput<Name>) => (
    wire.request([word, subject, operation, name, permission])
  )

  return {
    async get(name) { return parsePermission(name, (await operate("get", name) as [unknown])[0]) },
    async all() { return parsePermissions((await operate("all") as [unknown])[0]) },
    async allows(name, permission = true) { return (await operate("allows", name, permission) as [unknown])[0] === true },
    async set(name, permission) { await operate("set", name, permission) },
    async delete(name) { await operate("delete", name) }
  }
}

/** Stored grants and owner requests belonging to the current Client Endpoint. */
export function contextPermissions(): ContextPermissions {
  const timed = (timeout: number): TimedContextPermissions => ({
    async request<Name extends PermissionName>(name: Name, permission: PermissionRequest<Name> = true) {
      const identity = crypto.randomUUID()
      const result = await wire.requestOrNull(["context-permission-request", identity, name, permission], timeout)

      return result === null
        ? Object.freeze({ permission: null, needReload: false })
        : parsePermissionChange(name, (result as [unknown])[0])
    }
  })

  return {
    async get(name) {
      return parsePermission(name, (await wire.request(["context-permission-get", name]) as [unknown])[0])
    },
    async allows(name, permission = true) {
      return (await wire.request(["context-permission-allows", name, permission]) as [unknown])[0] === true
    },
    request: timed(defaultPermissionTimeout).request,
    timeout(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("A permission timeout must be a non-negative finite number")
      return timed(milliseconds)
    }
  }
}
