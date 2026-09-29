import type { DesktopPreferences, DesktopPreferencesEvents, DesktopPreferencesUpdate, WritableDesktopPreferencesSource } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/**
 * Tells the Desktop that this page shows the preferences it was last given, once what followed them
 * has been painted. The Desktop changes to a new Theme in one step and waits for the Programs it
 * shows, so they change in that same step. One confirmation covers every follower of one change.
 */
let confirming = false

function confirmShown() {
  if (confirming || typeof requestAnimationFrame !== "function") return
  confirming = true
  requestAnimationFrame(() => requestAnimationFrame(() => {
    confirming = false
    void wire.request(["desktop-preferences-shown"]).catch(() => undefined)
  }))
}

/** Effective preferences owned by the Desktop containing this Client Endpoint. */
export default class ClientPreferences extends Events<DesktopPreferencesEvents, never> implements WritableDesktopPreferencesSource {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-preferences", event, value => {
        listener(value as DesktopPreferences)
        confirmShown()
      }, null, impossible),
      observer => wire.onAll("host-desktop-preferences", (event, value) => {
        if (typeof event === "string") observer(event, value as DesktopPreferences)
        confirmShown()
      })
    )
  }

  public async snapshot() {
    const [preferences] = await wire.request(["desktopPreferences"]) as [DesktopPreferences]
    return preferences
  }

  public async update(preferences: DesktopPreferencesUpdate) {
    await wire.request(["updateDesktopPreferences", preferences])
  }
}
