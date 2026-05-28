import { describe, expect, it } from 'vitest'

import {
  classifyCartFulfillment,
  normalizeCartFulfillmentType,
} from './cart-fulfillment'

describe('cart fulfillment classifier', () => {
  it('classifies empty carts', () => {
    expect(classifyCartFulfillment([])).toBe('EMPTY')
  })

  it('classifies physical-only carts', () => {
    expect(
      classifyCartFulfillment([{ fulfillmentType: 'PHYSICAL' }, { fulfillmentType: 'physical' }])
    ).toBe('PHYSICAL_ONLY')
  })

  it('classifies digital-only carts', () => {
    expect(
      classifyCartFulfillment([{ fulfillmentType: 'DIGITAL' }, { fulfillmentType: 'digital' }])
    ).toBe('DIGITAL_ONLY')
  })

  it('classifies mixed carts', () => {
    expect(
      classifyCartFulfillment([{ fulfillmentType: 'DIGITAL' }, { fulfillmentType: 'PHYSICAL' }])
    ).toBe('MIXED')
  })

  it('defaults unknown fulfillment values to physical for safety', () => {
    expect(normalizeCartFulfillmentType(undefined)).toBe('PHYSICAL')
    expect(normalizeCartFulfillmentType(null)).toBe('PHYSICAL')
    expect(normalizeCartFulfillmentType('something-unknown')).toBe('PHYSICAL')
    expect(classifyCartFulfillment([{ fulfillmentType: '??' }])).toBe('PHYSICAL_ONLY')
  })
})

