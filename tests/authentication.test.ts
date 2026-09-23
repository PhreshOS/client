import { beforeEach, expect, test, vi } from "vitest"

const boundary = vi.hoisted(() => ({
  request: vi.fn(),
  on: vi.fn(),
  onAll: vi.fn(),
  stream: vi.fn()
}))

vi.mock("../source/wire.js", () => ({ default: boundary }))

import { desktop } from "../source/desktop/desktop.js"
import { system } from "../source/system.js"

beforeEach(() => {
  boundary.request.mockReset()
  boundary.request.mockImplementation(async (message: unknown[]) => {
    if (message[0] === "desktop-connection" || message[0] === "host-authentication-connection") {
      return [{ identity: "connection-one", connected: true, session: null }]
    }

    throw new Error(`Unexpected request ${String(message[0])}`)
  })
})

test("Desktop and System resolve one canonical Connection handle", async () => {
  const current = await desktop.connection()
  const found = await system.authentication.connection(current.identity)

  expect(found).toBe(current)
})

test("System Authentication owns public state, credentials, and both registries", async () => {
  boundary.request.mockImplementation(async (message: unknown[]) => {
    if (message[0] === "host-authentication-state") return [{ username: "owner" }]
    if (message[0] === "host-authentication-requirements") return [{
      username: { minimumLength: 1, maximumLength: 64 },
      password: { minimumLength: 8, maximumLength: 1024 }
    }]
    if (message[0] === "host-authentication-connections") return [[{ identity: "connection-one", connected: true, session: null }]]
    if (message[0] === "host-authentication-sessions") return [[{ identity: "session-one", valid: true }]]
    if (message[0] === "host-authentication-set-credentials" || message[0] === "host-authentication-sign-out-all-sessions") return []
    throw new Error(`Unexpected request ${String(message[0])}`)
  })

  await expect(system.authentication.state()).resolves.toEqual({ username: "owner" })
  await expect(system.authentication.requirements()).resolves.toEqual({
    username: { minimumLength: 1, maximumLength: 64 },
    password: { minimumLength: 8, maximumLength: 1024 }
  })
  await expect(system.authentication.connections()).resolves.toHaveLength(1)
  await expect(system.authentication.sessions()).resolves.toHaveLength(1)
  await system.authentication.setCredentials({ username: "next", password: "next-password" })
  await system.authentication.signOutAllSessions()

  expect(boundary.request).toHaveBeenCalledWith(["host-authentication-set-credentials", { username: "next", password: "next-password" }])
  expect(boundary.request).toHaveBeenCalledWith(["host-authentication-sign-out-all-sessions"])
})
