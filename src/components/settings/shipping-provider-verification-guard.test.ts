import { describe, expect, it } from 'vitest'

import { createProviderVerificationGuard } from './shipping-provider-verification-guard'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('shipping provider verification guard', () => {
  it('ignores a slower earlier verification response', async () => {
    const guard = createProviderVerificationGuard()
    guard.openDrawer()
    const first = guard.begin()
    const firstResponse = deferred<string>()
    const second = guard.begin()
    const secondResponse = deferred<string>()
    const applied: string[] = []

    void firstResponse.promise.then((value) => { if (guard.isCurrent(first)) applied.push(value) })
    void secondResponse.promise.then((value) => { if (guard.isCurrent(second)) applied.push(value) })

    secondResponse.resolve('newer')
    await Promise.resolve()
    firstResponse.resolve('older')
    await Promise.resolve()

    expect(applied).toEqual(['newer'])
  })

  it('invalidates pending work when the drawer closes before reopening', () => {
    const guard = createProviderVerificationGuard()
    guard.openDrawer()
    const request = guard.begin()
    guard.closeDrawer()
    guard.openDrawer()
    expect(guard.isCurrent(request)).toBe(false)
  })

  it('keeps a reopened drawer owned only by its new verification request', () => {
    const guard = createProviderVerificationGuard()
    guard.openDrawer()
    const oldRequest = guard.begin()
    guard.closeDrawer()
    guard.openDrawer()
    const newRequest = guard.begin()

    expect(guard.isCurrent(oldRequest)).toBe(false)
    expect(guard.isCurrent(newRequest)).toBe(true)
  })
})
