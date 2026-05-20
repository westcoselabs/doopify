import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
}))

vi.mock('@/server/auth/require-auth', () => ({
  requireAdmin: mocks.requireAdmin,
}))

vi.mock('@/server/services/product.service', () => ({
  updateVariant: mocks.updateVariant,
  deleteVariant: mocks.deleteVariant,
}))

import { PATCH, DELETE } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdmin.mockResolvedValue({ ok: true, user: { id: 'user_1', role: 'OWNER' } })
})

describe('PATCH /api/products/[id]/variants/[variantId]', () => {
  it('requires admin authorization', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 12, weightUnit: 'oz' }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(401)
    expect(mocks.updateVariant).not.toHaveBeenCalled()
  })

  it('saves weight and weightUnit together', async () => {
    mocks.updateVariant.mockResolvedValue({
      id: 'var_1',
      title: 'Default',
      weight: 12,
      weightUnit: 'oz',
    })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 12, weightUnit: 'oz' }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.objectContaining({ weight: 12, weightUnit: 'oz' })
    )
  })

  it('saves weight in kg unit', async () => {
    mocks.updateVariant.mockResolvedValue({
      id: 'var_1',
      weight: 0.5,
      weightUnit: 'kg',
    })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 0.5, weightUnit: 'kg' }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.objectContaining({ weight: 0.5, weightUnit: 'kg' })
    )
  })

  it('saves weight without unit (unit remains unchanged in DB)', async () => {
    mocks.updateVariant.mockResolvedValue({ id: 'var_1', weight: 8 })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 8 }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.not.objectContaining({ weightUnit: expect.anything() })
    )
  })

  it('accepts zero weight values', async () => {
    mocks.updateVariant.mockResolvedValue({ id: 'var_1', weight: 0, weightUnit: 'oz' })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 0, weightUnit: 'oz' }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.objectContaining({ weight: 0, weightUnit: 'oz' })
    )
  })

  it('allows clearing weight with null', async () => {
    mocks.updateVariant.mockResolvedValue({ id: 'var_1', weight: null })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: null }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.objectContaining({ weight: null })
    )
  })

  it('rejects negative weight values', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: -5 }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be 0 or greater',
    })
    expect(mocks.updateVariant).not.toHaveBeenCalled()
  })

  it('rejects invalid weight units', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ weight: 5, weightUnit: 'stone' }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid enum value'),
    })
    expect(mocks.updateVariant).not.toHaveBeenCalled()
  })

  it('rejects infinite weight values', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: '{"weight":1e309}',
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Weight must be a finite number',
    })
    expect(mocks.updateVariant).not.toHaveBeenCalled()
  })

  it('updates inventory without touching weight', async () => {
    mocks.updateVariant.mockResolvedValue({ id: 'var_1', inventory: 50 })

    const response = await PATCH(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'PATCH',
        body: JSON.stringify({ inventory: 50 }),
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.updateVariant).toHaveBeenCalledWith(
      'var_1',
      expect.objectContaining({ inventory: 50 })
    )
  })
})

describe('DELETE /api/products/[id]/variants/[variantId]', () => {
  it('deletes a variant when authorized', async () => {
    mocks.deleteVariant.mockResolvedValue(undefined)

    const response = await DELETE(
      new Request('http://localhost/api/products/prod_1/variants/var_1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: 'prod_1', variantId: 'var_1' }) }
    )

    expect(response.status).toBe(204)
    expect(mocks.deleteVariant).toHaveBeenCalledWith('var_1')
  })
})
