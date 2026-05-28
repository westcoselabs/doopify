import { normalizeCartFulfillmentType } from '@/lib/checkout/cart-fulfillment'
import { prisma } from '@/lib/prisma'
import { ensureDigitalDownloadDeliveryToken } from '@/server/services/digital-download-delivery.service'
import {
  createDownloadToken,
  getDefaultDigitalGrantPolicy,
  hashDownloadToken,
} from '@/server/services/digital-download-grant.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'
import { Prisma } from '@prisma/client'

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

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
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
      id: true,
      orderItemId: true,
      digitalAssetId: true,
    },
  })
  const existingByKey = new Map(
    existingGrants.map((grant) => [buildGrantKey(grant.orderItemId, grant.digitalAssetId), grant] as const)
  )

  const policy = getDefaultDigitalGrantPolicy(input.now)
  const createData: Array<{
    storeId: string
    orderId: string
    orderItemId: string
    productId: string
    digitalAssetId: string
    rawToken: string
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
      if (existingByKey.has(key)) {
        skippedExisting += 1
        continue
      }

      const rawToken = createDownloadToken()
      createData.push({
        storeId: store.id,
        orderId: order.id,
        orderItemId: item.id,
        productId: item.product.id,
        digitalAssetId,
        rawToken,
        tokenHash: hashDownloadToken(rawToken),
        downloadLimit: policy.downloadLimit,
        expiresAt: policy.expiresAt,
      })
    }
  }

  let created = 0
  if (createData.length) {
    await prisma.$transaction(async (tx) => {
      for (const candidate of createData) {
        let grantId: string | null = null
        let deliveryToken: string | undefined = undefined

        try {
          const createdGrant = await tx.digitalDownloadGrant.create({
            data: {
              storeId: candidate.storeId,
              orderId: candidate.orderId,
              orderItemId: candidate.orderItemId,
              productId: candidate.productId,
              digitalAssetId: candidate.digitalAssetId,
              tokenHash: candidate.tokenHash,
              downloadLimit: candidate.downloadLimit,
              expiresAt: candidate.expiresAt,
            },
            select: { id: true },
          })
          created += 1
          grantId = createdGrant.id
          deliveryToken = candidate.rawToken
        } catch (error) {
          if (!isUniqueConstraintError(error)) {
            throw error
          }

          const existing = await tx.digitalDownloadGrant.findUnique({
            where: {
              orderItemId_digitalAssetId: {
                orderItemId: candidate.orderItemId,
                digitalAssetId: candidate.digitalAssetId,
              },
            },
            select: { id: true },
          })

          if (!existing) {
            throw error
          }

          skippedExisting += 1
          grantId = existing.id
        }

        if (!grantId) {
          continue
        }

        await ensureDigitalDownloadDeliveryToken({
          tx,
          grantId,
          rawToken: deliveryToken,
        })
      }
    })
  }

  if (existingByKey.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const existing of existingByKey.values()) {
        await ensureDigitalDownloadDeliveryToken({
          tx,
          grantId: existing.id,
        })
      }
    })
  }

  return {
    created,
    skippedExisting,
    missingLinkedAssets,
    mixedOrderDetected: hasDigitalItems && hasPhysicalItems,
  }
}
