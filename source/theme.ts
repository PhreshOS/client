import { type Theme, type ThemePreference } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Mutable Theme local to the current Desktop. */
export default class ClientTheme extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-theme", event, value => listener(value as Theme), null, impossible),
      observer => wire.onAll("host-theme", (event, value) => {
        if (typeof event === "string") observer(event, value as Theme)
      })
    )
  }

  public async snapshot() {
    const [theme] = await wire.request(["theme"]) as [Theme]
    return theme
  }

  public async update(theme: ThemePreference) {
    await wire.request(["update-theme", theme])
  }
}
