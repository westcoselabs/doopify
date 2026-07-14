import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    store: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    shippingPackage: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    shippingManualRate: {
      create: vi.fn(),
    },
    shippingLocation: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: mocks.prisma,
}))

import {
  createShippingLocation,
  createShippingManualRate,
  createShippingPackage,
  updateShippingLocation,
  updateShippingPackage,
} from './shipping-delivery-settings.service'

describe('shipping-delivery-settings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.store.findMany.mockResolvedValue([])
    mocks.prisma.store.findFirst.mockResolvedValue({ id: 'store_1' })
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.prisma) => Promise<unknown>) => callback(mocks.prisma)
    )
  })

  it('createShippingPackage enforces single default package when created as default', async () => {
    mocks.prisma.shippingPackage.create.mockResolvedValue({
      id: 'pkg_new',
      storeId: 'store_1',
      isDefault: true,
    })
    mocks.prisma.shippingPackage.updateMany.mockResolvedValue({ count: 1 })

    await createShippingPackage({
      name: 'My Box',
      type: 'BOX',
      length: 10,
      width: 8,
      height: 4,
      dimensionUnit: 'IN',
      emptyPackageWeight: 12,
      weightUnit: 'OZ',
      isDefault: true,
      isActive: true,
    })

    expect(mocks.prisma.shippingPackage.updateMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store_1',
        id: { not: 'pkg_new' },
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    })
  })

  it('createShippingPackage does not touch other packages when new package is not default', async () => {
    mocks.prisma.shippingPackage.create.mockResolvedValue({
      id: 'pkg_new',
      storeId: 'store_1',
      isDefault: false,
    })

    await createShippingPackage({
      name: 'My Box',
      type: 'BOX',
      length: 10,
      width: 8,
      height: 4,
      dimensionUnit: 'IN',
      emptyPackageWeight: 12,
      weightUnit: 'OZ',
      isDefault: false,
      isActive: true,
    })

    expect(mocks.prisma.shippingPackage.updateMany).not.toHaveBeenCalled()
  })

  it('updateShippingPackage enforces single default package when updated to default', async () => {
    mocks.prisma.shippingPackage.findFirst.mockResolvedValue({
      id: 'pkg_existing',
      storeId: 'store_1',
      isDefault: false,
    })
    mocks.prisma.shippingPackage.update.mockResolvedValue({
      id: 'pkg_existing',
      storeId: 'store_1',
      isDefault: true,
    })
    mocks.prisma.shippingPackage.updateMany.mockResolvedValue({ count: 1 })

    await updateShippingPackage('pkg_existing', {
      isDefault: true,
      name: 'Updated',
    })

    expect(mocks.prisma.shippingPackage.updateMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store_1',
        id: { not: 'pkg_existing' },
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    })
  })

  it('updateShippingPackage throws when package does not belong to store', async () => {
    mocks.prisma.shippingPackage.findFirst.mockResolvedValue(null)

    await expect(
      updateShippingPackage('missing', {
        name: 'Nope',
      })
    ).rejects.toThrow('Package not found')
  })

  it('createShippingManualRate bootstraps a store when one does not exist', async () => {
    mocks.prisma.store.findFirst.mockResolvedValueOnce(null)
    mocks.prisma.store.create.mockResolvedValue({ id: 'store_bootstrap' })
    mocks.prisma.shippingManualRate.create.mockResolvedValue({
      id: 'rate_1',
      storeId: 'store_bootstrap',
      name: 'Standard',
      amountCents: 1000,
      rateType: 'FLAT',
    })

    await createShippingManualRate({
      name: 'Standard',
      regionCountry: 'US',
      regionStateProvince: null,
      rateType: 'FLAT',
      amountCents: 1000,
      minWeight: null,
      maxWeight: null,
      minSubtotalCents: null,
      maxSubtotalCents: null,
      freeOverAmountCents: null,
      estimatedDeliveryText: '3-5 days',
      isActive: true,
    })

    expect(mocks.prisma.store.create).toHaveBeenCalledWith({
      data: {
        name: 'Doopify Store',
        singletonKey: 'PRIMARY',
      },
      select: { id: true },
    })
    expect(mocks.prisma.shippingManualRate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: 'store_bootstrap',
        name: 'Standard',
        amountCents: 1000,
      }),
    })
  })

  it('createShippingLocation persists ship-from email and enforces single default', async () => {
    mocks.prisma.shippingLocation.create.mockResolvedValue({
      id: 'loc_1',
      storeId: 'store_1',
      email: 'shipping@example.com',
      isDefault: true,
    })
    mocks.prisma.shippingLocation.updateMany.mockResolvedValue({ count: 1 })

    await createShippingLocation({
      name: 'Warehouse',
      contactName: 'Ops',
      email: 'shipping@example.com',
      company: null,
      address1: '10 Main St',
      address2: null,
      city: 'Austin',
      stateProvince: 'TX',
      postalCode: '78701',
      country: 'US',
      phone: '555-000-0000',
      isDefault: true,
      isActive: true,
    })

    expect(mocks.prisma.shippingLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'shipping@example.com',
        }),
      })
    )
    expect(mocks.prisma.shippingLocation.updateMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store_1',
        id: { not: 'loc_1' },
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    })
  })

  it('updateShippingLocation persists ship-from email updates', async () => {
    mocks.prisma.shippingLocation.findFirst.mockResolvedValue({
      id: 'loc_1',
      storeId: 'store_1',
      isDefault: false,
    })
    mocks.prisma.shippingLocation.update.mockResolvedValue({
      id: 'loc_1',
      storeId: 'store_1',
      email: 'new-ship@example.com',
      isDefault: false,
    })

    await updateShippingLocation('loc_1', {
      email: 'new-ship@example.com',
    })

    expect(mocks.prisma.shippingLocation.update).toHaveBeenCalledWith({
      where: { id: 'loc_1' },
      data: { email: 'new-ship@example.com' },
    })
  })
})
