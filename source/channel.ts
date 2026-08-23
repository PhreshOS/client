import type {
  Channel as CoreChannel,
  ChannelCapture as CoreChannelCapture,
  ChannelEvents as CoreChannelEvents,
  ChannelMessage as CoreChannelMessage
} from "@phreshos/core"
import { visibleEndpoint, type Endpoint, type EndpointReference } from "./domain.js"
import Events from "./events.js"
import wire from "./wire.js"
import { disableCurrentService, enableCurrentService } from "./service.js"

/** One value addressed to the current Client, with a client-visible sender. */
export type ChannelMessage<Payload = unknown> = CoreChannelMessage<Payload, Endpoint | null>

/** Applies the client-visible sender envelope to known Channel events. */
export type ChannelEvents<Events extends object> = CoreChannelEvents<Events, Endpoint | null>

/** Every event observable through the current Client's Channel. */
export type ChannelCapture<Events extends object = {}> = CoreChannelCapture<Events, Endpoint | null>

/** Events explicitly accepted by the current Client. */
export interface Channel<Events extends object = {}> extends CoreChannel<Events, Endpoint | null> {}

class ClientChannel extends Events {
  public constructor() {
    super(
      (event, listener, impossible) => wire.on("end-end", event, value => listener(message(value)), null, impossible),
      observer => wire.onAll("end-end", (event, value) => {
        if (typeof event === "string") observer(event, message(value))
      })
    )
  }

  public publish(event: string, payload: unknown = undefined) {
    wire.send("end-host", "emit", event, payload)
  }

  public async enableService(name: string) { await enableCurrentService(name) }
  public async disableService() { await disableCurrentService() }
}

function message(value: unknown): ChannelMessage {
  const raw = value as { from?: EndpointReference | null, payload?: unknown }
  return { from: visibleEndpoint(raw.from), payload: raw.payload }
}

export const channel = new ClientChannel() as unknown as Channel
