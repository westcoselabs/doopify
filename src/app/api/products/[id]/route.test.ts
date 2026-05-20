import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  archiveProduct: vi.fn(),
  upsertOptions: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/product.service', () => ({
  getProduct: mocks.getProduct,
  updateProduct: mocks.updateProduct,
  archiveProduct: mocks.archiveProduct,
  upsertOptions: mocks.upsertOptions,
}))

import { PATCH } from './route'

const params = { params: Promise.resolve({ id: 'prod_1' }) }

const basePayload = {
  variants: [
    {
      id: 'var_1',
      title: 'Default',
      price: 19.99,
      inventory: 10,
      weight: 2.5,
      weightUnit: 'kg',
    },
  ],
}

describe('PATCH /api/products/[id] weight validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'user_1', role: 'OWNER' } })
    mocks.updateProduct.mockResolvedValue({ id: 'prod_1', handle: 'weighted-product' })
  })

  it('rejects invalid weightUnit', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: JSON.stringify({
          variants: [
            {
              id: 'var_1',
              title: 'Default',
              price: 19.99,
              inventory: 10,
              weight: 2.5,
              weightUnit: 'stone',
            },
          ],
        }),
      }),
      params
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid enum value'),
    })
    expect(mocks.updateProduct).not.toHaveBeenCalled()
  })

  it('rejects negative weight', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: JSON.stringify({
          variants: [
            {
              id: 'var_1',
              title: 'Default',
              price: 19.99,
              inventory: 10,
              weight: -2.5,
              weightUnit: 'kg',
            },
          ],
        }),
      }),
      params
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be 0 or greater',
    })
    expect(mocks.updateProduct).not.toHaveBeenCalled()
  })

  it('accepts decimal, zero, and null weight values', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: JSON.stringify({
          variants: [
            {
              id: 'var_1',
              title: 'Decimal',
              price: 19.99,
              inventory: 10,
              weight: 2.5,
              weightUnit: 'kg',
            },
            {
              id: 'var_2',
              title: 'Zero',
              price: 21.99,
              inventory: 7,
              weight: 0,
              weightUnit: 'oz',
            },
            {
              id: 'var_3',
              title: 'Cleared',
              price: 17.99,
              inventory: 3,
              weight: null,
            },
          ],
        }),
      }),
      params
    )

    expect(response.status).toBe(200)
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({
        variants: [
          expect.objectContaining({ id: 'var_1', weight: 2.5, weightUnit: 'kg' }),
          expect.objectContaining({ id: 'var_2', weight: 0, weightUnit: 'oz' }),
          expect.objectContaining({ id: 'var_3', weight: null }),
        ],
      })
    )
  })

  it('rejects infinite weight values', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: '{"variants":[{"id":"var_1","title":"Default","price":19.99,"weight":1e309}]}'
      }),
      params
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be a finite number',
    })
    expect(mocks.updateProduct).not.toHaveBeenCalled()
  })

  it('keeps parsing strict and rejects string weight payloads', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: JSON.stringify({
          variants: [
            {
              id: 'var_1',
              title: 'Default',
              price: 19.99,
              weight: '2.5',
              weightUnit: 'kg',
            },
          ],
        }),
      }),
      params
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be a number',
    })
    expect(mocks.updateProduct).not.toHaveBeenCalled()
  })

  it('keeps existing mapping for valid weights', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1', {
        method: 'PATCH',
        body: JSON.stringify(basePayload),
      }),
      params
    )

    expect(response.status).toBe(200)
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      'prod_1',
      expect.objectContaining({
        variants: [
          expect.objectContaining({
            id: 'var_1',
            title: 'Default',
            weight: 2.5,
            weightUnit: 'kg',
          }),
        ],
      })
    )
  })
})
