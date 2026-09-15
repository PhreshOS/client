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
    if (message[0] === "desktop-connection" || message[0] === "host-connection-find") {
      return [{ identity: "connection-one", connected: true, session: null }]
    }

    throw new Error(`Unexpected request ${String(message[0])}`)
  })
})

test("Desktop and System resolve one canonical Connection handle", async () => {
  const current = await desktop.connection()
  const found = await system.connection.find(current.identity)

  expect(found).toBe(current)
})
