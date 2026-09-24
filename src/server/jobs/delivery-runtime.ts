export const DELIVERY_LEASE_MS = 120_000
export const PROVIDER_TIMEOUT_MS = 15_000

/** Acquire work only while runner time remains; never preclaim a waiting queue. */
export async function runBounded<T, R>(items: T[], execute: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = []
  const deadline = Date.now() + 45_000
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length && Date.now() < deadline) {
      const index = cursor++
      try { results[index] = { status: 'fulfilled', value: await execute(items[index]) } }
      catch (reason) { results[index] = { status: 'rejected', reason } }
    }
  }))
  return results
}

export async function readBoundedResponse(response: Response, maximumBytes = 1000) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (length < maximumBytes) {
      const { value, done } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, maximumBytes - length)
      chunks.push(chunk)
      length += chunk.length
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}
