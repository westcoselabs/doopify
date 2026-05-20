import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getProductSummaries: vi.fn(),
  createProduct: vi.fn(),
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
  getProductSummaries: mocks.getProductSummaries,
  createProduct: mocks.createProduct,
  upsertOptions: mocks.upsertOptions,
}))

import { POST } from './route'

const validBasePayload = {
  title: 'Weighted Product',
  variants: [
    {
      title: 'Default',
      price: 19.99,
      inventory: 10,
      weight: 1.25,
      weightUnit: 'lb',
    },
  ],
}

describe('POST /api/products weight validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'user_1', role: 'OWNER' } })
    mocks.createProduct.mockResolvedValue({
      product: { id: 'prod_1', handle: 'weighted-product' },
      mediaSyncError: undefined,
    })
  })

  it('rejects invalid weightUnit', async () => {
    const response = await POST(
      new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...validBasePayload,
          variants: [
            {
              title: 'Default',
              price: 19.99,
              inventory: 10,
              weight: 1.25,
              weightUnit: 'stone',
            },
          ],
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid enum value'),
    })
    expect(mocks.createProduct).not.toHaveBeenCalled()
  })

  it('rejects negative weight', async () => {
    const response = await POST(
      new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...validBasePayload,
          variants: [
            {
              title: 'Default',
              price: 19.99,
              inventory: 10,
              weight: -1,
              weightUnit: 'kg',
            },
          ],
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be 0 or greater',
    })
    expect(mocks.createProduct).not.toHaveBeenCalled()
  })

  it('accepts decimal, zero, and null weight values', async () => {
    const response = await POST(
      new Request('http://localhost/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...validBasePayload,
          variants: [
            {
              title: 'Decimal',
              price: 19.99,
              inventory: 10,
              weight: 1.25,
              weightUnit: 'lb',
            },
            {
              title: 'Zero',
              price: 29.99,
              inventory: 5,
              weight: 0,
              weightUnit: 'oz',
            },
            {
              title: 'Cleared',
              price: 9.99,
              inventory: 2,
              weight: null,
            },
          ],
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: [
          expect.objectContaining({ title: 'Decimal', weight: 1.25, weightUnit: 'lb' }),
          expect.objectContaining({ title: 'Zero', weight: 0, weightUnit: 'oz' }),
          expect.objectContaining({ title: 'Cleared', weight: null }),
        ],
      })
    )
  })
})
