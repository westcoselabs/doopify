import { describe, expect, it } from 'vitest'

import {
  findVariantBySelectedOptions,
  getVariantOptionValues,
  isVariantValueSelectable,
  parseVariantOptionValuesFromTitle,
} from './storefront-variant-matching'

const options = [
  {
    name: 'Size',
    values: [{ value: 'S/M' }, { value: 'L' }],
  },
  {
    name: 'Color',
    values: [{ value: 'Red' }, { value: 'Blue' }],
  },
]

describe('storefront variant matching', () => {
  it('parses option values from titles even when a value contains "/"', () => {
    expect(parseVariantOptionValuesFromTitle('S/M / Red', options)).toEqual({
      Size: 'S/M',
      Color: 'Red',
    })
  })

  it('prefers structured optionValues over title parsing', () => {
    expect(
      getVariantOptionValues(
        {
          title: 'Customized Label',
          optionValues: {
            Size: 'L',
            Color: 'Blue',
          },
        },
        options
      )
    ).toEqual({
      Size: 'L',
      Color: 'Blue',
    })
  })

  it('resolves the correct variant by selected option name/value pairs', () => {
    const variants = [
      { id: 'v1', title: 'S/M / Red' },
      { id: 'v2', title: 'L / Blue' },
      { id: 'v3', title: 'S/M / Blue' },
    ]

    expect(
      findVariantBySelectedOptions({
        variants,
        options,
        selectedOptions: {
          Size: 'S/M',
          Color: 'Blue',
        },
      })
    ).toEqual(variants[2])
  })

  it('uses structured option values to evaluate selectable combinations', () => {
    const variants = [
      {
        id: 'v1',
        title: 'Custom Variant A',
        optionValues: {
          Size: 'S/M',
          Color: 'Red',
        },
      },
      {
        id: 'v2',
        title: 'Custom Variant B',
        optionValues: {
          Size: 'L',
          Color: 'Blue',
        },
      },
    ]

    expect(
      isVariantValueSelectable({
        variants,
        options,
        selectedOptions: {
          Size: 'S/M',
          Color: 'Red',
        },
        optionName: 'Color',
        optionValue: 'Blue',
      })
    ).toBe(false)

    expect(
      isVariantValueSelectable({
        variants,
        options,
        selectedOptions: {
          Size: 'L',
          Color: 'Red',
        },
        optionName: 'Color',
        optionValue: 'Blue',
      })
    ).toBe(true)
  })
})
