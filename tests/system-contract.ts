import type { Connection, Session, System as CoreSystem } from "@phreshos/core"
import { desktop, system } from "../source/main.js"

declare const canonical: CoreSystem

const shared: CoreSystem = system
const attached: typeof system = canonical
const connections: Promise<Connection[]> = system.connection.list()
const sessions: Promise<Session[]> = system.session.list()
const desktopConnection: Promise<Connection> = desktop.connection()

void [shared, attached, connections, sessions, desktopConnection]
