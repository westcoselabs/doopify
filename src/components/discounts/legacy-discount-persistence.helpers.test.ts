import { describe, expect, it, vi } from 'vitest'

import {
  buildLegacyDiscountApiPayload,
  persistLegacyDiscountDraft,
} from './legacy-discount-persistence.helpers'

describe('legacy discount persistence helpers', () => {
  it('creates a percentage discount payload with uppercase code and active status', () => {
    expect(
      buildLegacyDiscountApiPayload({
        title: 'Summer sale',
        code: 'summer10',
        method: 'amount off products',
        valueType: 'percentage',
        value: '10',
        status: 'active',
      })
    ).toMatchObject({
      title: 'Summer sale',
      code: 'SUMMER10',
      type: 'CODE',
      method: 'PERCENTAGE',
      value: 10,
      status: 'ACTIVE',
    })
  })

  it('creates a fixed amount payload using cents', () => {
    expect(
      buildLegacyDiscountApiPayload({
        title: 'Ten dollars off',
        code: 'tenoff',
        method: 'amount off order',
        valueType: 'fixed',
        value: '10',
        minimumRequirementType: 'subtotal',
        minimumRequirementValue: '50',
        status: 'active',
      })
    ).toMatchObject({
      code: 'TENOFF',
      method: 'FIXED_AMOUNT',
      value: 1000,
      minimumOrderCents: 5000,
      status: 'ACTIVE',
    })
  })

  it('creates a free shipping payload with zero value', () => {
    expect(
      buildLegacyDiscountApiPayload({
        title: 'Free ship',
        code: 'freeship',
        method: 'free shipping',
        status: 'scheduled',
      })
    ).toMatchObject({
      method: 'FREE_SHIPPING',
      value: 0,
      status: 'SCHEDULED',
    })
  })

  it('calls POST /api/discounts for new discounts and refetches after success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'disc_1' } }),
    })
    const onPersisted = vi.fn().mockResolvedValue(undefined)

    const result = await persistLegacyDiscountDraft({
      draft: {
        id: 'draft_123',
        title: 'Welcome',
        code: 'welcome10',
        method: 'amount off products',
        valueType: 'percentage',
        value: '10',
        status: 'active',
      },
      fetchImpl,
      onPersisted,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/discounts',
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(onPersisted).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(true)
  })

  it('calls PATCH for existing discounts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'disc_1' } }),
    })

    await persistLegacyDiscountDraft({
      draft: {
        id: 'disc_1',
        title: 'Updated',
        code: 'updated10',
        method: 'amount off order',
        valueType: 'fixed',
        value: '15',
        status: 'active',
      },
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/discounts/disc_1',
      expect.objectContaining({
        method: 'PATCH',
      })
    )
  })

  it('returns duplicate-code errors without treating them as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: 'A discount with this code already exists' }),
    })
    const onPersisted = vi.fn().mockResolvedValue(undefined)

    const result = await persistLegacyDiscountDraft({
      draft: {
        id: 'draft_123',
        title: 'Duplicate',
        code: 'duped',
        method: 'amount off products',
        valueType: 'percentage',
        value: '10',
        status: 'active',
      },
      fetchImpl,
      onPersisted,
    })

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'A discount with this code already exists',
      })
    )
    expect(onPersisted).not.toHaveBeenCalled()
  })
})
