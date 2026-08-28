/** Wrap a transferred byte stream so cancellation and completion release its transport. */
export default function controlledStream(body: ReadableStream<Uint8Array>, abort: () => void, close: () => void) {
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await reader.read()
        if (next.done) {
          close()
          controller.close()
        } else controller.enqueue(next.value)
      } catch (error) {
        close()
        controller.error(error)
      }
    },
    async cancel(reason) {
      abort()
      close()
      await reader.cancel(reason)
    }
  })
}
