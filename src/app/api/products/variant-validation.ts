import { z } from 'zod'

const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const

const finiteNonNegativeWeight = z
  .number({ invalid_type_error: 'Weight must be a number' })
  .finite('Weight must be a finite number')
  .min(0, 'Weight must be 0 or greater')

export const variantWeightSchema = finiteNonNegativeWeight.nullable().optional()

export const variantWeightUnitSchema = z
  .enum(WEIGHT_UNITS, {
    invalid_type_error: 'Weight unit must be one of: g, kg, oz, lb',
  })
  .optional()

