import wire from "./wire.js"

/** Acquire permission, then open the browser's native WebSocket. */
export default async function websocket(
  url: string | URL,
  protocols?: string | string[]
): Promise<WebSocket> {
  const address = new URL(String(url), document.baseURI)

  if (address.protocol === "http:") address.protocol = "ws:"
  if (address.protocol === "https:") address.protocol = "wss:"

  await wire.request(["websocket", address.href, protocols])

  return protocols === undefined
    ? new WebSocket(address.href)
    : new WebSocket(address.href, protocols)
}
