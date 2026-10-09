import { expect, test, vi } from "vitest"

const boundary = vi.hoisted(() => ({
  request: vi.fn(),
  on: vi.fn(),
  onAll: vi.fn(),
  stream: vi.fn()
}))

vi.mock("../source/wire.js", () => ({ default: boundary }))

import ClientPreferences from "../source/desktop/preferences.js"

test("what was chosen and what it resolves to are read and followed apart", async () => {
  boundary.request.mockImplementation(async (message: unknown[]) => {
    if (message[0] === "desktopPreferences") return [{ theme: "browser", animations: "browser", scale: 1 }]
    if (message[0] === "resolvedDesktopPreferences") return [{ theme: "dark", animations: true, scale: 1 }]
    throw new Error(`Unexpected request ${String(message[0])}`)
  })
  const listeners = new Map<string, (value: unknown) => void>()
  boundary.on.mockImplementation((_route: string, event: string, listener: (value: unknown) => void) => {
    listeners.set(event, listener)
    return () => listeners.delete(event)
  })
  const preferences = new ClientPreferences()

  await expect(preferences.snapshot()).resolves.toEqual({ theme: "browser", animations: "browser", scale: 1 })
  await expect(preferences.resolve()).resolves.toEqual({ theme: "dark", animations: true, scale: 1 })

  const chosen = vi.fn(), resolved = vi.fn()
  preferences.subscribe("change", chosen)
  preferences.subscribe("changeResolved", resolved)
  listeners.get("changeResolved")!({ theme: "light", animations: true, scale: 1 })

  expect(resolved).toHaveBeenCalledWith({ theme: "light", animations: true, scale: 1 })
  expect(chosen).not.toHaveBeenCalled()
})
