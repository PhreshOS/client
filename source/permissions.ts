import type { PermissionDecision, PermissionName, Permissions, TimedPermissions } from "@phreshos/core"
import wire from "./wire.js"

const defaultPermissionTimeout = 30_000

/** Client permission access bound to the current Process boundary. */
export default class ClientPermissions implements Permissions {
  public async granted(name: PermissionName): Promise<PermissionDecision> {
    const answer = await wire.request(["permission-granted", name]) as [PermissionDecision]
    return answer[0]
  }

  public request(name: PermissionName): Promise<PermissionDecision> {
    return this.requestWithin(name, defaultPermissionTimeout)
  }

  public timeout(milliseconds: number): TimedPermissions {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error("A permission timeout must be a non-negative finite number")

    return Object.freeze({ request: (name: PermissionName) => this.requestWithin(name, milliseconds) })
  }

  private async requestWithin(name: PermissionName, milliseconds: number): Promise<PermissionDecision> {
    const answer = await wire.requestOrNull(["permission-request", name], milliseconds) as [PermissionDecision] | null
    return answer?.[0] ?? null
  }
}
