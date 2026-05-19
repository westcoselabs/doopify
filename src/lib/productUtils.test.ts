import { describe, expect, it } from 'vitest'
import {
  getComputedProductState,
  getComputedProductStateMeta,
  isFuturePublishDate,
  prepareProductForSave,
} from './productUtils'

describe('product lifecycle state helpers', () => {
  it('marks active products with a future publish date as scheduled', () => {
    const now = new Date('2026-04-30T12:00:00.000Z')
    const futureDate = '2026-05-01T10:00:00.000Z'

    expect(isFuturePublishDate(futureDate, now)).toBe(true)
    expect(
      getComputedProductState(
        {
          status: 'active',
          publishedAt: futureDate,
        },
        now
      )
    ).toBe('scheduled')
    expect(
      getComputedProductStateMeta(
        {
          status: 'active',
          publishedAt: futureDate,
        },
        now
      )
    ).toEqual({
      state: 'scheduled',
      label: 'Scheduled',
      tone: 'info',
    })
  })

  it('keeps archived precedence and treats future publish dates as scheduled', () => {
    const now = new Date('2026-04-30T12:00:00.000Z')
    const futureDate = '2026-05-01T10:00:00.000Z'

    expect(getComputedProductState({ status: 'archived', publishedAt: futureDate }, now)).toBe('archived')
    expect(getComputedProductState({ status: 'draft', publishedAt: futureDate }, now)).toBe('scheduled')
  })
})

describe('prepareProductForSave variant weight persistence', () => {
  const baseProduct = {
    id: 'prod-weight',
    title: 'Weighted Product',
    status: 'active',
    publishedAt: null,
    description: '',
    vendor: '',
    category: 'Shirts',
    tags: [],
    sku: 'WEIGHT-BASE',
    basePrice: '19.99',
    compareAtPrice: '24.99',
    featuredImageId: null,
    images: [],
    options: [
      { id: 'opt-size', name: 'Size', values: ['S', 'M'] },
    ],
    variants: [
      {
        id: 'var-s',
        title: 'S',
        optionValues: { Size: 'S' },
        sku: 'WEIGHT-S',
        price: '19.99',
        compareAtPrice: '24.99',
        inventoryQty: 8,
        weight: 0.75,
        weightUnit: 'kg',
        imageId: null,
        isActive: true,
      },
      {
        id: 'var-m',
        title: 'M',
        optionValues: { Size: 'M' },
        sku: 'WEIGHT-M',
        price: '21.50',
        compareAtPrice: '24.99',
        inventoryQty: 6,
        weight: 12,
        weightUnit: 'oz',
        imageId: null,
        isActive: true,
      },
    ],
  }

  it('keeps variant weight and weight unit values for multi-variant products', () => {
    const result = prepareProductForSave(baseProduct)
    const variantS = result.variants.find((variant) => variant.id === 'var-s')
    const variantM = result.variants.find((variant) => variant.id === 'var-m')

    expect(variantS?.weight).toBe(0.75)
    expect(variantS?.weightUnit).toBe('kg')
    expect(variantM?.weight).toBe(12)
    expect(variantM?.weightUnit).toBe('oz')
    expect(variantM?.sku).toBe('WEIGHT-M')
    expect(variantM?.inventoryQty).toBe(6)
  })

  it('normalizes invalid/negative weight values to null with safe default unit', () => {
    const invalidInput = {
      ...baseProduct,
      variants: [
        {
          ...baseProduct.variants[0],
          weight: -5,
          weightUnit: 'STONE',
        },
      ],
      options: [],
    }

    const result = prepareProductForSave(invalidInput)
    expect(result.variants[0]?.weight).toBeNull()
    expect(result.variants[0]?.weightUnit).toBe('kg')
    expect(result.variants[0]?.sku).toBe('WEIGHT-BASE')
  })
})
