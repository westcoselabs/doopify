export const DELIVERY_LEASE_MS = 120_000
export const PROVIDER_TIMEOUT_MS = 15_000

/** Claim just in time; stop each slot as soon as the shared queue is empty. */
export async function runAvailable<T, R>(limit: number, claim: () => Promise<T | null>, execute: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = []
  const deadline = Date.now() + 45_000
  let remaining = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 25
  let drained = false
  let claimFailed = false
  let claimError: unknown
  await Promise.all(Array.from({ length: Math.min(4, remaining) }, async () => {
    while (!drained && remaining > 0 && Date.now() < deadline) {
      remaining--
      let item: T | null
      try { item = await claim() }
      catch (reason) { drained = true; claimFailed = true; claimError = reason; return }
      if (item === null) { drained = true; return }
      try { results.push({ status: 'fulfilled', value: await execute(item) }) }
      catch (reason) { results.push({ status: 'rejected', reason }) }
    }
  }))
  // Let already-owned work finish before reporting an acquisition failure.
  if (claimFailed) throw claimError
  return results
}

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
