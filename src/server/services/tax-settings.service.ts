import { prisma } from '@/lib/prisma'
import { findPrimaryStore } from '@/server/services/primary-store.service'

export async function getTaxSettingsStore() {
  return findPrimaryStore({
    select: {
      id: true,
      taxEnabled: true,
      taxStrategy: true,
      defaultTaxRateBps: true,
      taxShipping: true,
      pricesIncludeTax: true,
      taxOriginCountry: true,
      taxOriginState: true,
      taxOriginPostalCode: true,
    },
  })
}

export async function updateTaxSettings(
  storeId: string,
  input: Partial<{
    taxEnabled: boolean
    taxStrategy: 'NONE' | 'MANUAL'
    defaultTaxRateBps: number
    taxShipping: boolean
    pricesIncludeTax: boolean
    taxOriginCountry: string | null
    taxOriginState: string | null
    taxOriginPostalCode: string | null
  }>
) {
  return prisma.store.update({
    where: { id: storeId },
    data: input,
    select: {
      id: true,
      taxEnabled: true,
      taxStrategy: true,
      defaultTaxRateBps: true,
      taxShipping: true,
      pricesIncludeTax: true,
      taxOriginCountry: true,
      taxOriginState: true,
      taxOriginPostalCode: true,
    },
  })
}
