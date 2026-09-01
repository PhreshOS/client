import type { DesktopPreferences, DesktopPreferencesUpdate } from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** Effective preferences owned by the Desktop containing this Client. */
export default class ClientPreferences extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-preferences", event, value => {
        listener(value as DesktopPreferences)
      }, null, impossible),
      observer => wire.onAll("host-desktop-preferences", (event, value) => {
        if (typeof event === "string") observer(event, value as DesktopPreferences)
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
