import type { Desktop } from "@phreshos/core"
import ClientPreferences from "./preferences.js"
import ClientViewport from "./viewport.js"

/** Desktop access bound to the current Client Endpoint's Process boundary. */
class ClientDesktop implements Desktop {
  public readonly viewport = new ClientViewport()
  public readonly preferences = new ClientPreferences()
}

/** The Desktop environment containing this Client Endpoint. */
export const desktop: Desktop = new ClientDesktop()
