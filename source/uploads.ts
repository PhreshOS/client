import { isUploadFile, type SystemUploads, type Upload } from "@phreshos/core"
import { content } from "./content.js"
import controlledStream from "./controlled-stream.js"
import wire from "./wire.js"

/** Flat upload access transported through the Client's Desktop boundary. */
class ClientUploads implements SystemUploads {
  public async write(value: unknown): Promise<Upload> {
    const source = content(value)
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")

    try {
      const answer = await wire.request(
        ["uploads", "write", source.body, { extension: source.extension, type: source.type }, channel.port2],
        undefined,
        source.body instanceof ReadableStream ? [source.body, channel.port2] : [channel.port2]
      ) as [Upload]
      channel.port1.close()
      return answer[0]
    } catch (error) {
      abort()
      channel.port1.close()
      throw error
    }
  }

  public async stream(file: string): Promise<ReadableStream<Uint8Array>> {
    requireFile(file)
    const channel = new MessageChannel()
    const abort = () => channel.port1.postMessage("abort")
    const close = () => channel.port1.close()

    try {
      const answer = await wire.request(
        ["uploads", "stream", file, channel.port2],
        undefined,
        [channel.port2]
      ) as [unknown]

      if (!(answer[0] instanceof ReadableStream)) throw new Error("The upload response has no byte stream")

      return controlledStream(answer[0], abort, close)
    } catch (error) {
      abort()
      close()
      throw error
    }
  }

  public async bytes(file: string) {
    return new Uint8Array(await new Response(await this.stream(file)).arrayBuffer())
  }

  public async text(file: string) {
    return new Response(await this.stream(file)).text()
  }

  public async json<Value>(file: string) {
    return JSON.parse(await this.text(file)) as Value
  }

  public async stat(file: string): Promise<Upload | null> {
    requireFile(file)
    const answer = await wire.request(["uploads", "stat", file]) as [Upload | null]
    return answer[0]
  }
}

function requireFile(file: string) {
  if (!isUploadFile(file)) throw new Error("That is not an upload file")
}

export const uploads = new ClientUploads()
