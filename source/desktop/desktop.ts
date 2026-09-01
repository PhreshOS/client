import type {
  DesktopPointerSource,
  DesktopSurfaceSource,
  WritableDesktopPreferencesSource
} from "@phreshos/core"
import ClientPointer from "./pointer.js"
import ClientPreferences from "./preferences.js"
import ClientSurface from "./surface.js"

/** Every capability owned by the Desktop containing this Client. */
export interface SystemDesktop {
  readonly surface: DesktopSurfaceSource
  readonly pointer: DesktopPointerSource
  readonly preferences: WritableDesktopPreferencesSource
}

/** Desktop access bound to the current Client Process boundary. */
export default class ClientDesktop implements SystemDesktop {
  public readonly surface = new ClientSurface() as unknown as DesktopSurfaceSource
  public readonly pointer = new ClientPointer() as unknown as DesktopPointerSource
  public readonly preferences = new ClientPreferences() as unknown as WritableDesktopPreferencesSource
}
