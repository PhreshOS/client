import type { Desktop } from "@phreshos/core"
import { connection } from "../authentication.js"
import wire from "../wire.js"
import ClientPreferences from "./preferences.js"
import ClientViewport from "./viewport.js"

/** Desktop access bound to the current Client Endpoint's Process boundary. */
class ClientDesktop implements Desktop {
  public readonly viewport = new ClientViewport()
  public readonly preferences = new ClientPreferences()

  public async connection() {
    const [snapshot] = await wire.request(["desktop-connection"]) as [unknown]
    return connection(snapshot)
  }
}

/** The Desktop environment containing this Client Endpoint. */
export const desktop: Desktop = new ClientDesktop()
