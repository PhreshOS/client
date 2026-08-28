import {
  type DesktopPreferences,
  type DesktopPreferencesUpdate
} from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Mutable effective preferences local to the current Desktop. */
export default class ClientDesktopPreferences extends Events {
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
