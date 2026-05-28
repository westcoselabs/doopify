import { normalizeCartFulfillmentType } from '@/lib/checkout/cart-fulfillment'
import { prisma } from '@/lib/prisma'
import {
  createDownloadToken,
  getDefaultDigitalGrantPolicy,
  hashDownloadToken,
} from '@/server/services/digital-download-grant.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'

type IssueDigitalGrantsInput = {
  orderId: string
  now?: Date
}

export type IssueDigitalGrantsResult = {
  created: number
  skippedExisting: number
  missingLinkedAssets: number
  mixedOrderDetected: boolean
}

type OrderWithDigitalContext = {
  id: string
  orderNumber: number
  paymentStatus: string
  items: Array<{
    id: string
    productId: string | null
    title: string
    product: {
      id: string
      fulfillmentType: string
      digitalAssets: Array<{ digitalAssetId: string }>
    } | null
  }>
}

function buildGrantKey(orderItemId: string, digitalAssetId: string) {
  return `${orderItemId}:${digitalAssetId}`
}

export async function issueDigitalDownloadGrantsForPaidOrder(
  input: IssueDigitalGrantsInput
): Promise<IssueDigitalGrantsResult> {
  const order = (await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      items: {
        select: {
          id: true,
          productId: true,
          title: true,
          product: {
            select: {
              id: true,
              fulfillmentType: true,
              digitalAssets: {
                select: {
                  digitalAssetId: true,
                },
              },
            },
          },
        },
      },
    },
  })) as OrderWithDigitalContext | null

  if (!order) {
    throw new Error(`Order ${input.orderId} could not be found`)
  }

  if (order.paymentStatus !== 'PAID') {
    return {
      created: 0,
      skippedExisting: 0,
      missingLinkedAssets: 0,
      mixedOrderDetected: false,
    }
  }

  const store = await getStoreSettingsLite()
  if (!store?.id) {
    throw new Error('Store is not configured')
  }

  const existingGrants = await prisma.digitalDownloadGrant.findMany({
    where: { orderId: order.id },
    select: {
      orderItemId: true,
      digitalAssetId: true,
    },
  })
  const existingKeys = new Set(
    existingGrants.map((grant) => buildGrantKey(grant.orderItemId, grant.digitalAssetId))
  )

  const policy = getDefaultDigitalGrantPolicy(input.now)
  const createData: Array<{
    storeId: string
    orderId: string
    orderItemId: string
    productId: string
    digitalAssetId: string
    tokenHash: string
    downloadLimit: number
    expiresAt: Date
  }> = []

  let skippedExisting = 0
  let missingLinkedAssets = 0
  let hasDigitalItems = false
  let hasPhysicalItems = false

  for (const item of order.items) {
    const fulfillmentType = normalizeCartFulfillmentType(item.product?.fulfillmentType)
    if (fulfillmentType === 'DIGITAL') {
      hasDigitalItems = true
    } else {
      hasPhysicalItems = true
      continue
    }

    if (!item.productId || !item.product) {
      missingLinkedAssets += 1
      console.warn(
        `[digital-grants] Skipping order ${order.orderNumber} item ${item.id}: digital product context is missing`
      )
      continue
    }

    const assetIds = Array.from(
      new Set(item.product.digitalAssets.map((link) => link.digitalAssetId).filter(Boolean))
    )
    if (!assetIds.length) {
      missingLinkedAssets += 1
      console.warn(
        `[digital-grants] Skipping order ${order.orderNumber} item ${item.id}: no linked digital assets for product ${item.productId}`
      )
      continue
    }

    for (const digitalAssetId of assetIds) {
      const key = buildGrantKey(item.id, digitalAssetId)
      if (existingKeys.has(key)) {
        skippedExisting += 1
        continue
      }

      createData.push({
        storeId: store.id,
        orderId: order.id,
        orderItemId: item.id,
        productId: item.product.id,
        digitalAssetId,
        tokenHash: hashDownloadToken(createDownloadToken()),
        downloadLimit: policy.downloadLimit,
        expiresAt: policy.expiresAt,
      })
    }
  }

  let created = 0
  if (createData.length) {
    const result = await prisma.digitalDownloadGrant.createMany({
      data: createData,
      skipDuplicates: true,
    })
    created = result.count
    skippedExisting += createData.length - created
  }

  return {
    created,
    skippedExisting,
    missingLinkedAssets,
    mixedOrderDetected: hasDigitalItems && hasPhysicalItems,
  }
}
