import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { store: mocks.store } }))

import { createPrimaryStore, findPrimaryStore } from './primary-store.service'

describe('primary store resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the PRIMARY singleton before any legacy fallback', async () => {
    mocks.store.findFirst.mockResolvedValueOnce({ id: 'primary' })
    await expect(findPrimaryStore({ select: { id: true } })).resolves.toEqual({ id: 'primary' })
    expect(mocks.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { singletonKey: 'PRIMARY' },
    }))
    expect(mocks.store.findMany).not.toHaveBeenCalled()
  })

  it('uses a deterministic legacy fallback and logs no store data when duplicates exist', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.store.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'legacy-a' })
    mocks.store.findMany.mockResolvedValue([{ id: 'legacy-a' }, { id: 'legacy-b' }])

    await expect(findPrimaryStore({ select: { id: true } })).resolves.toEqual({ id: 'legacy-a' })
    expect(mocks.store.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }))
    expect(warning).toHaveBeenCalledWith(expect.any(String), { duplicateCountAtLeast: 2 })
  })

  it('creates newly bootstrapped stores with the canonical singleton key', async () => {
    mocks.store.create.mockResolvedValue({ id: 'primary' })
    await createPrimaryStore({ data: { name: 'Doopify' }, select: { id: true } })
    expect(mocks.store.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'Doopify', singletonKey: 'PRIMARY' },
    }))
  })
})
