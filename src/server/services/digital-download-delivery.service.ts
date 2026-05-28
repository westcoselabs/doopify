import { Prisma, type Prisma as PrismaNamespace } from '@prisma/client'

import { normalizeCartFulfillmentType } from '@/lib/checkout/cart-fulfillment'
import { evaluatePublicStoreUrl } from '@/lib/public-store-url'
import { prisma } from '@/lib/prisma'
import {
  createDownloadToken,
  hashDownloadToken,
} from '@/server/services/digital-download-grant.service'
import { decrypt, encrypt } from '@/server/utils/crypto'

export type BuyerDigitalDownloadLink = {
  fileName: string
  title: string
  downloadUrl: string
  expiresAt: Date
  downloadLimit: number
  downloadCount: number
}

export type BuyerDigitalDownloadAvailability = {
  hasDigitalItems: boolean
  pending: boolean
  downloads: BuyerDigitalDownloadLink[]
}

type EnsureDigitalDownloadDeliveryInput = {
  tx: PrismaNamespace.TransactionClient
  grantId: string
  rawToken?: string
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function normalizeRawToken(value: string) {
  return value.trim()
}

function resolveDownloadBaseUrl() {
  const evaluation = evaluatePublicStoreUrl({
    value: process.env.NEXT_PUBLIC_STORE_URL,
    nodeEnv: process.env.NODE_ENV,
  })

  if (!evaluation.ready || !evaluation.normalizedBaseUrl) {
    return null
  }

  return evaluation.normalizedBaseUrl
}

function buildDownloadUrl(token: string, absoluteUrls: boolean) {
  const path = `/api/digital-downloads/${encodeURIComponent(token)}`
  if (!absoluteUrls) {
    return path
  }

  const baseUrl = resolveDownloadBaseUrl()
  if (!baseUrl) {
    return null
  }

  return `${baseUrl}${path}`
}

function decryptStoredToken(tokenEnc: string) {
  try {
    const token = normalizeRawToken(decrypt(tokenEnc))
    return token || null
  } catch {
    return null
  }
}

export async function ensureDigitalDownloadDeliveryToken(
  input: EnsureDigitalDownloadDeliveryInput
): Promise<{ created: boolean; rotatedGrantToken: boolean }> {
  const existing = await input.tx.digitalDownloadDelivery.findUnique({
    where: { grantId: input.grantId },
    select: { id: true },
  })

  if (existing) {
    return {
      created: false,
      rotatedGrantToken: false,
    }
  }

  const providedToken = input.rawToken ? normalizeRawToken(input.rawToken) : ''
  const rawToken = providedToken || createDownloadToken()
  const tokenHash = hashDownloadToken(rawToken)

  if (!providedToken) {
    await input.tx.digitalDownloadGrant.update({
      where: { id: input.grantId },
      data: {
        tokenHash,
      },
    })
  }

  await input.tx.digitalDownloadDelivery.create({
    data: {
      grantId: input.grantId,
      tokenEnc: encrypt(rawToken),
    },
  }).catch((error) => {
    if (!isUniqueConstraintError(error)) {
      throw error
    }
  })

  return {
    created: true,
    rotatedGrantToken: !providedToken,
  }
}

export async function getBuyerDigitalDownloadAvailabilityForPaidOrder(input: {
  orderId: string
  absoluteUrls?: boolean
}): Promise<BuyerDigitalDownloadAvailability> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      paymentStatus: true,
      items: {
        select: {
          id: true,
          product: {
            select: {
              fulfillmentType: true,
            },
          },
        },
      },
    },
  })

  if (!order || order.paymentStatus !== 'PAID') {
    return {
      hasDigitalItems: false,
      pending: false,
      downloads: [],
    }
  }

  const digitalOrderItemIds = order.items
    .filter((item) => normalizeCartFulfillmentType(item.product?.fulfillmentType) === 'DIGITAL')
    .map((item) => item.id)

  if (digitalOrderItemIds.length === 0) {
    return {
      hasDigitalItems: false,
      pending: false,
      downloads: [],
    }
  }

  const grants = await prisma.digitalDownloadGrant.findMany({
    where: {
      orderId: input.orderId,
      orderItemId: {
        in: digitalOrderItemIds,
      },
    },
    orderBy: [{ orderItemId: 'asc' }, { createdAt: 'asc' }],
    select: {
      downloadLimit: true,
      downloadCount: true,
      expiresAt: true,
      digitalAsset: {
        select: {
          fileName: true,
          title: true,
        },
      },
      delivery: {
        select: {
          tokenEnc: true,
        },
      },
    },
  })

  let unresolved = 0
  const downloads: BuyerDigitalDownloadLink[] = []

  for (const grant of grants) {
    const decryptedToken = grant.delivery?.tokenEnc
      ? decryptStoredToken(grant.delivery.tokenEnc)
      : null

    if (!decryptedToken) {
      unresolved += 1
      continue
    }

    const downloadUrl = buildDownloadUrl(decryptedToken, Boolean(input.absoluteUrls))
    if (!downloadUrl) {
      unresolved += 1
      continue
    }

    const fileName = String(grant.digitalAsset.fileName || '').trim()
    const title = String(grant.digitalAsset.title || '').trim() || fileName || 'Digital download'

    downloads.push({
      fileName: fileName || 'download',
      title,
      downloadUrl,
      expiresAt: grant.expiresAt,
      downloadLimit: grant.downloadLimit,
      downloadCount: grant.downloadCount,
    })
  }

  return {
    hasDigitalItems: true,
    pending: downloads.length === 0 || unresolved > 0,
    downloads,
  }
}
