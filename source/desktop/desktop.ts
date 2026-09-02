import type { Desktop } from "@phreshos/core"
import ClientPreferences from "./preferences.js"
import ClientSurface from "./surface.js"

/** Desktop access bound to the current Client Process boundary. */
class ClientDesktop implements Desktop {
  public readonly surface = new ClientSurface()
  public readonly preferences = new ClientPreferences()
}

/** The Desktop environment containing this Client. */
export const desktop: Desktop = new ClientDesktop()
