import type {
  ContextPermissions,
  PermissionInput,
  PermissionName,
  PermissionRequest,
  ProgramPermissions,
  TimedContextPermissions
} from "@phreshos/core"
import { parsePermission, parsePermissionChange, parsePermissions } from "@phreshos/core"
import type { HandleAddress } from "./domain.js"
import wire from "./wire.js"

export const defaultPermissionTimeout = 120_000

/** Bind authoritative stored grants to one exact Program handle. */
export function programPermissions(program: HandleAddress): ProgramPermissions {
  const operate = <Name extends PermissionName>(operation: "all" | "get" | "set" | "delete", name?: Name, permission?: Exclude<PermissionInput<Name>, null>) => (
    wire.request(["program-permissions", program, operation, name, permission])
  )

  return {
    async get(name) { return parsePermission(name, (await operate("get", name) as [unknown])[0]) },
    async all() { return parsePermissions((await operate("all") as [unknown])[0]) },
    async set(name, permission) { return parsePermissionChange(name, (await operate("set", name, permission) as [unknown])[0]) },
    async delete(name) { return parsePermissionChange(name, (await operate("delete", name) as [unknown])[0]) }
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
    request: timed(defaultPermissionTimeout).request,
    timeout(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("A permission timeout must be a non-negative finite number")
      return timed(milliseconds)
    }
  }
}
