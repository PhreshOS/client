import { createAppearanceSnapshot, type Appearance, type AppearanceEvents, type WritableAppearance } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Read-only System Appearance reached through the Desktop boundary. */
export default class ClientAppearance extends Events<AppearanceEvents, never> implements WritableAppearance {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-appearance", event, value => {
        listener(createAppearanceSnapshot(value as Appearance))
      }, null, impossible),
      observer => wire.onAll("host-appearance", (event, value) => {
        if (typeof event === "string") observer(event, createAppearanceSnapshot(value as Appearance))
      })
    )
  }

  public async snapshot() {
    const [appearance] = await wire.request(["appearance"]) as [Appearance]
    return createAppearanceSnapshot(appearance)
  }

  public async update(appearance: Appearance) {
    await wire.request(["updateAppearance", appearance])
  }
}
