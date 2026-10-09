import { describe, expect, it } from 'vitest'
import { runAvailable } from './delivery-runtime'

describe('just-in-time worker acquisition', () => {
  it('bounds execution concurrency without claiming a waiting backlog', async () => {
    const queue = Array.from({ length: 12 }, (_, id) => id)
    let active = 0, maximum = 0
    const result = await runAvailable(12, async () => {
      expect(active).toBeLessThan(4)
      return queue.shift() ?? null
    }, async id => {
      active++
      maximum = Math.max(active, maximum)
      await new Promise(resolve => setTimeout(resolve, 1))
      active--
      return id
    })
    expect(maximum).toBe(4)
    expect(result).toHaveLength(12)
    expect(new Set(result.map(row => row.status === 'fulfilled' ? row.value : null)).size).toBe(12)
  })
  it('finishes owned work before surfacing a claim failure', async () => {
    let calls = 0, finished = false
    const result = runAvailable(8, async () => {
      if (++calls === 1) return 'owned'
      throw new Error('database unavailable')
    }, async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      finished = true
    })
    await expect(result).rejects.toThrow('database unavailable')
    expect(finished).toBe(true)
    expect(calls).toBeLessThanOrEqual(4)
  })
})
