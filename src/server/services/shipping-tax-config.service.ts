import { type ShippingRateMethod } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { findPrimaryStore } from '@/server/services/primary-store.service'

function normalizeCountryCode(value: string) {
  return value.trim().toUpperCase()
}

function normalizeProvinceCode(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
  return normalized || null
}

async function getStoreIdOrThrow() {
  const store = await findPrimaryStore({
    select: { id: true },
  })

  if (!store) {
    throw new Error('Store not found')
  }

  return store.id
}

function shippingZoneInclude() {
  return {
    rates: {
      orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }],
    },
  }
}

export async function listShippingZones() {
  const storeId = await getStoreIdOrThrow()
  return prisma.shippingZone.findMany({
    where: { storeId },
    include: shippingZoneInclude(),
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createShippingZone(input: {
  name: string
  countryCode: string
  provinceCode?: string | null
  isActive?: boolean
  priority?: number
  rates?: Array<{
    name: string
    method?: ShippingRateMethod
    amountCents: number
    minSubtotalCents?: number | null
    maxSubtotalCents?: number | null
    isActive?: boolean
    priority?: number
  }>
}) {
  const storeId = await getStoreIdOrThrow()

  return prisma.shippingZone.create({
    data: {
      storeId,
      name: input.name.trim(),
      countryCode: normalizeCountryCode(input.countryCode),
      provinceCode: normalizeProvinceCode(input.provinceCode),
      isActive: input.isActive ?? true,
      priority: input.priority ?? 100,
      rates: input.rates?.length
        ? {
            create: input.rates.map((rate) => ({
              name: rate.name.trim(),
              method: rate.method ?? 'FLAT',
              amountCents: rate.amountCents,
              minSubtotalCents: rate.minSubtotalCents ?? null,
              maxSubtotalCents: rate.maxSubtotalCents ?? null,
              isActive: rate.isActive ?? true,
              priority: rate.priority ?? 100,
            })),
          }
        : undefined,
    },
    include: shippingZoneInclude(),
  })
}

export async function updateShippingZone(
  zoneId: string,
  input: Partial<{
    name: string
    countryCode: string
    provinceCode?: string | null
    isActive: boolean
    priority: number
  }>
) {
  const storeId = await getStoreIdOrThrow()
  const existing = await prisma.shippingZone.findUnique({
    where: { id: zoneId },
    select: { id: true, storeId: true },
  })

  if (!existing || existing.storeId !== storeId) {
    throw new Error('Shipping zone not found')
  }

  return prisma.shippingZone.update({
    where: { id: zoneId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.countryCode !== undefined
        ? {
            countryCode: normalizeCountryCode(input.countryCode),
          }
        : {}),
      ...(input.provinceCode !== undefined
        ? { provinceCode: normalizeProvinceCode(input.provinceCode) }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
    include: shippingZoneInclude(),
  })
}

export async function deleteShippingZone(zoneId: string) {
  const storeId = await getStoreIdOrThrow()
  const existing = await prisma.shippingZone.findUnique({
    where: { id: zoneId },
    select: { id: true, storeId: true },
  })

  if (!existing || existing.storeId !== storeId) {
    throw new Error('Shipping zone not found')
  }

  return prisma.shippingZone.delete({
    where: { id: zoneId },
  })
}

export async function createShippingRate(
  zoneId: string,
  input: {
    name: string
    method?: ShippingRateMethod
    amountCents: number
    minSubtotalCents?: number | null
    maxSubtotalCents?: number | null
    isActive?: boolean
    priority?: number
  }
) {
  const storeId = await getStoreIdOrThrow()
  const existingZone = await prisma.shippingZone.findUnique({
    where: { id: zoneId },
    select: { id: true, storeId: true },
  })

  if (!existingZone || existingZone.storeId !== storeId) {
    throw new Error('Shipping zone not found')
  }

  return prisma.shippingRate.create({
    data: {
      shippingZoneId: zoneId,
      name: input.name.trim(),
      method: input.method ?? 'FLAT',
      amountCents: input.amountCents,
      minSubtotalCents: input.minSubtotalCents ?? null,
      maxSubtotalCents: input.maxSubtotalCents ?? null,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 100,
    },
  })
}

export async function updateShippingRate(
  zoneId: string,
  rateId: string,
  input: Partial<{
    name: string
    method: ShippingRateMethod
    amountCents: number
    minSubtotalCents?: number | null
    maxSubtotalCents?: number | null
    isActive: boolean
    priority: number
  }>
) {
  const storeId = await getStoreIdOrThrow()
  const rate = await prisma.shippingRate.findUnique({
    where: { id: rateId },
    include: {
      shippingZone: {
        select: { id: true, storeId: true },
      },
    },
  })

  if (!rate || rate.shippingZoneId !== zoneId || rate.shippingZone.storeId !== storeId) {
    throw new Error('Shipping rate not found')
  }

  return prisma.shippingRate.update({
    where: { id: rateId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.minSubtotalCents !== undefined ? { minSubtotalCents: input.minSubtotalCents ?? null } : {}),
      ...(input.maxSubtotalCents !== undefined ? { maxSubtotalCents: input.maxSubtotalCents ?? null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  })
}

export async function deleteShippingRate(zoneId: string, rateId: string) {
  const storeId = await getStoreIdOrThrow()
  const rate = await prisma.shippingRate.findUnique({
    where: { id: rateId },
    include: {
      shippingZone: {
        select: { id: true, storeId: true },
      },
    },
  })

  if (!rate || rate.shippingZoneId !== zoneId || rate.shippingZone.storeId !== storeId) {
    throw new Error('Shipping rate not found')
  }

  return prisma.shippingRate.delete({
    where: { id: rateId },
  })
}

export async function listTaxRules() {
  const storeId = await getStoreIdOrThrow()
  return prisma.taxRule.findMany({
    where: { storeId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createTaxRule(input: {
  name: string
  countryCode: string
  provinceCode?: string | null
  rate: number
  isActive?: boolean
  priority?: number
}) {
  const storeId = await getStoreIdOrThrow()
  return prisma.taxRule.create({
    data: {
      storeId,
      name: input.name.trim(),
      countryCode: normalizeCountryCode(input.countryCode),
      provinceCode: normalizeProvinceCode(input.provinceCode),
      rate: input.rate,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 100,
    },
  })
}

export async function updateTaxRule(
  ruleId: string,
  input: Partial<{
    name: string
    countryCode: string
    provinceCode?: string | null
    rate: number
    isActive: boolean
    priority: number
  }>
) {
  const storeId = await getStoreIdOrThrow()
  const existing = await prisma.taxRule.findUnique({
    where: { id: ruleId },
    select: { id: true, storeId: true },
  })

  if (!existing || existing.storeId !== storeId) {
    throw new Error('Tax rule not found')
  }

  return prisma.taxRule.update({
    where: { id: ruleId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.countryCode !== undefined
        ? {
            countryCode: normalizeCountryCode(input.countryCode),
          }
        : {}),
      ...(input.provinceCode !== undefined
        ? { provinceCode: normalizeProvinceCode(input.provinceCode) }
        : {}),
      ...(input.rate !== undefined ? { rate: input.rate } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  })
}

export async function deleteTaxRule(ruleId: string) {
  const storeId = await getStoreIdOrThrow()
  const existing = await prisma.taxRule.findUnique({
    where: { id: ruleId },
    select: { id: true, storeId: true },
  })

  if (!existing || existing.storeId !== storeId) {
    throw new Error('Tax rule not found')
  }

  return prisma.taxRule.delete({
    where: { id: ruleId },
  })
}
