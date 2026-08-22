import { createThemeSnapshot, type ThemeProperties } from "@phreshos/core"
import Events from "./events.js"
import wire from "./wire.js"

/** Read-only system Theme reached explicitly through the desktop boundary. */
export default class ClientTheme extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("host-theme", event, value => {
        if (isObject(value)) listener(createThemeSnapshot(value))
      }, null, impossible),
      observer => wire.onAll("host-theme", (event, value) => {
        if (typeof event === "string" && isObject(value)) observer(event, createThemeSnapshot(value))
      })
    )
  }

  public async snapshot() {
    const answer = await wire.request(["theme"]) as [ThemeProperties]
    if (!isObject(answer[0])) throw new Error("The desktop returned an invalid Theme snapshot")
    return createThemeSnapshot(answer[0])
  }
}

function isObject(value: unknown): value is ThemeProperties {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const theme = value as Partial<ThemeProperties>
  const surface = (theme as { surface?: Record<string, unknown> }).surface
  return typeof theme.background === "string" && typeof theme.foreground === "string" && typeof theme.accent === "string"
    && typeof theme.spacing === "number" && typeof theme.radius === "number"
    && typeof theme.glass === "object" && theme.glass !== null
    && typeof surface === "object" && surface !== null && typeof surface.color === "string"
    && typeof surface.grain === "number" && typeof surface.animation === "number"
    && typeof surface.backdrop === "number" && typeof surface.opacity === "number"
}
