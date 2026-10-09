import {
  parseDesktopPreferences,
  parseResolvedDesktopPreferences,
  type DesktopPreferencesEvents,
  type DesktopPreferencesUpdate,
  type WritableDesktopPreferencesSource
} from "@phreshos/core"
import Events from "../events.js"
import wire from "../wire.js"

/** What was chosen for the Desktop containing this Client Endpoint, and what it resolves to. */
export default class ClientPreferences extends Events<DesktopPreferencesEvents, never> implements WritableDesktopPreferencesSource {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-desktop-preferences", event, value => {
        listener(parsed(event as keyof DesktopPreferencesEvents, value))
      }, null, impossible),
      observer => wire.onAll("host-desktop-preferences", (event, value) => {
        if (event === "change" || event === "changeResolved") observer(event, parsed(event, value))
      })
    )
  }

  public async snapshot() {
    const [preferences] = await wire.request(["desktopPreferences"]) as [unknown]
    return parseDesktopPreferences(preferences)
  }

  public async resolve() {
    const [resolved] = await wire.request(["resolvedDesktopPreferences"]) as [unknown]
    return parseResolvedDesktopPreferences(resolved)
  }

  public async update(preferences: DesktopPreferencesUpdate) {
    await wire.request(["updateDesktopPreferences", preferences])
  }
}

function parsed(event: keyof DesktopPreferencesEvents, value: unknown) {
  return event === "change" ? parseDesktopPreferences(value) : parseResolvedDesktopPreferences(value)
}
