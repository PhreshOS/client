import { parseAppearance, type AppearanceEvents, type AppearanceUpdate, type WritableAppearance } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Read-only System Appearance reached through the Desktop boundary. */
export default class ClientAppearance extends Events<AppearanceEvents, never> implements WritableAppearance {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-appearance", event, value => {
        listener(parseAppearance(value))
      }, null, impossible),
      observer => wire.onAll("host-appearance", (event, value) => {
        if (typeof event === "string") observer(event, parseAppearance(value))
      })
    )
  }

  public async snapshot() {
    const [appearance] = await wire.request(["appearance"]) as [unknown]
    return parseAppearance(appearance)
  }

  public async update(appearance: AppearanceUpdate) {
    await wire.request(["updateAppearance", appearance])
  }
}
