import wire from "./wire.js"

/** Acquire permission, then open the browser's native WebSocket. */
export default async function websocket(
  url: string | URL,
  protocols?: string | string[]
): Promise<WebSocket> {
  const address = String(url)

  await wire.request(["websocket", address, protocols])

  return protocols === undefined
    ? new WebSocket(address)
    : new WebSocket(address, protocols)
}
