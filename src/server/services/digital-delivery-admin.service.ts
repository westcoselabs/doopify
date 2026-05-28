import { DigitalDownloadEventResult, Prisma } from '@prisma/client'

import { normalizeCartFulfillmentType } from '@/lib/checkout/cart-fulfillment'
import { prisma } from '@/lib/prisma'
import { ensureDigitalDownloadDeliveryToken } from '@/server/services/digital-download-delivery.service'
import {
  createDownloadToken,
  hashDownloadToken,
  hasDigitalGrantDownloadsRemaining,
  isDigitalGrantExpired,
  isDigitalGrantRevoked,
} from '@/server/services/digital-download-grant.service'
import { queueOrderConfirmationEmailDelivery } from '@/server/services/email-delivery.service'
import { getStoreSettingsLite } from '@/server/services/settings.service'
import { decrypt, encrypt } from '@/server/utils/crypto'

export type DigitalDeliveryGrantStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'PENDING'

export type DigitalDeliveryEventSummary = {
  id: string
  result: DigitalDownloadEventResult
  label: 'Allowed' | 'Expired' | 'Revoked' | 'Exhausted' | 'Other'
  occurredAt: Date
}

export type DigitalDeliveryGrantSummary = {
  grantId: string
  orderItemId: string
  digitalAssetId: string
  fileName: string
  title: string
  status: DigitalDeliveryGrantStatus
  downloadCount: number
  downloadLimit: number
  expiresAt: Date
  revokedAt: Date | null
  lastDownloadedAt: Date | null
  deliveryEmailStatus: string | null
  deliveryTokenAvailable: boolean
  events: DigitalDeliveryEventSummary[]
}

export type OrderDigitalDeliverySummary = {
  orderId: string
  orderNumber: number
  hasDigitalItems: boolean
  pending: boolean
  deliveryEmailStatus: string | null
  deliveryEmailLastSentAt: Date | null
  grants: DigitalDeliveryGrantSummary[]
}

export type AdminDigitalDownloadLink = {
  grantId: string
  downloadUrl: string
}

export type ResendOrderDigitalDownloadsResult =
  | {
      queued: true
      orderId: string
      orderNumber: number
      emailDeliveryId: string
      emailDeliveryStatus: string
      jobId: string
      rotatedMissingDeliveryTokens: number
    }
  | {
      queued: false
      reason: 'MISSING_CUSTOMER_EMAIL' | 'NO_DIGITAL_GRANTS'
      message: string
    }

export type RevokeDigitalDownloadGrantResult = {
  grantId: string
  revokedAt: Date
  alreadyRevoked: boolean
}

export type RegenerateDigitalDownloadGrantResult = {
  grantId: string
  downloadUrl: string
  preservedDownloadCount: true
  downloadCount: number
  downloadLimit: number
  status: DigitalDeliveryGrantStatus
}

type OrderDigitalContext = {
  id: string
  orderNumber: number
  email: string | null
  hasDigitalItems: boolean
  grants: Array<{
    id: string
    orderItemId: string
    digitalAssetId: string
    downloadLimit: number
    downloadCount: number
    expiresAt: Date
    revokedAt: Date | null
    lastDownloadedAt: Date | null
    digitalAsset: {
      fileName: string
      title: string
    }
    delivery: {
      tokenEnc: string
    } | null
    events: Array<{
      id: string
      result: DigitalDownloadEventResult
      occurredAt: Date
    }>
  }>
}

export class DigitalDeliveryAdminServiceError extends Error {
  code:
    | 'STORE_NOT_FOUND'
    | 'ORDER_NOT_FOUND'
    | 'GRANT_NOT_FOUND'
    | 'DELIVERY_TOKEN_UNAVAILABLE'
    | 'TOKEN_REGEN_FAILED'
  status: number

  constructor(
    code:
      | 'STORE_NOT_FOUND'
      | 'ORDER_NOT_FOUND'
      | 'GRANT_NOT_FOUND'
      | 'DELIVERY_TOKEN_UNAVAILABLE'
      | 'TOKEN_REGEN_FAILED',
    message: string,
    status: number
  ) {
    super(message)
    this.name = 'DigitalDeliveryAdminServiceError'
    this.code = code
    this.status = status
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function normalizeToken(token: string) {
  return token.trim()
}

function decryptStoredToken(tokenEnc: string | null | undefined) {
  if (!tokenEnc) return null

  try {
    const token = normalizeToken(decrypt(tokenEnc))
    return token || null
  } catch {
    return null
  }
}

function buildDownloadPath(token: string) {
  return `/api/digital-downloads/${encodeURIComponent(token)}`
}

function toEventLabel(result: DigitalDownloadEventResult) {
  switch (result) {
    case 'ALLOWED':
      return 'Allowed'
    case 'DENIED_EXPIRED':
      return 'Expired'
    case 'DENIED_REVOKED':
      return 'Revoked'
    case 'DENIED_EXHAUSTED':
      return 'Exhausted'
    default:
      return 'Other'
  }
}

function resolveGrantStatus(input: {
  revokedAt: Date | null
  expiresAt: Date
  downloadLimit: number
  downloadCount: number
  deliveryTokenAvailable: boolean
  now: Date
}): DigitalDeliveryGrantStatus {
  if (isDigitalGrantRevoked({ revokedAt: input.revokedAt })) return 'REVOKED'
  if (isDigitalGrantExpired({ expiresAt: input.expiresAt }, input.now)) return 'EXPIRED'
  if (
    !hasDigitalGrantDownloadsRemaining({
      downloadCount: input.downloadCount,
      downloadLimit: input.downloadLimit,
    })
  ) {
    return 'EXHAUSTED'
  }
  if (!input.deliveryTokenAvailable) return 'PENDING'
  return 'ACTIVE'
}

async function resolveStoreId() {
  const store = await getStoreSettingsLite()
  if (!store?.id) {
    throw new DigitalDeliveryAdminServiceError('STORE_NOT_FOUND', 'Store not found', 404)
  }
  return store.id
}

async function getOrderDigitalContext(orderId: string, storeId: string): Promise<OrderDigitalContext> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      email: true,
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
      digitalDownloadGrants: {
        where: { storeId },
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          orderItemId: true,
          digitalAssetId: true,
          downloadLimit: true,
          downloadCount: true,
          expiresAt: true,
          revokedAt: true,
          lastDownloadedAt: true,
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
          events: {
            select: {
              id: true,
              result: true,
              occurredAt: true,
            },
            orderBy: { occurredAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  })

  if (!order) {
    throw new DigitalDeliveryAdminServiceError('ORDER_NOT_FOUND', 'Order not found', 404)
  }

  const hasDigitalItems =
    order.items.some(
      (item) => normalizeCartFulfillmentType(item.product?.fulfillmentType) === 'DIGITAL'
    ) || order.digitalDownloadGrants.length > 0

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    email: order.email,
    hasDigitalItems,
    grants: order.digitalDownloadGrants,
  }
}

async function getStoreScopedGrant(grantId: string, storeId: string) {
  const grant = await prisma.digitalDownloadGrant.findFirst({
    where: {
      id: grantId,
      storeId,
    },
    select: {
      id: true,
      downloadLimit: true,
      downloadCount: true,
      expiresAt: true,
      revokedAt: true,
      delivery: {
        select: {
          id: true,
          tokenEnc: true,
        },
      },
    },
  })

  if (!grant) {
    throw new DigitalDeliveryAdminServiceError('GRANT_NOT_FOUND', 'Digital download grant not found', 404)
  }

  return grant
}

export async function getOrderDigitalDeliverySummary(orderId: string) {
  const storeId = await resolveStoreId()
  const now = new Date()
  const order = await getOrderDigitalContext(orderId, storeId)

  const latestDeliveryEmail = await prisma.emailDelivery.findFirst({
    where: {
      orderId: order.id,
      template: 'order_confirmation',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      status: true,
      sentAt: true,
    },
  })

  const grants = order.grants.map((grant): DigitalDeliveryGrantSummary => {
    const deliveryTokenAvailable = Boolean(decryptStoredToken(grant.delivery?.tokenEnc))
    const status = resolveGrantStatus({
      revokedAt: grant.revokedAt,
      expiresAt: grant.expiresAt,
      downloadLimit: grant.downloadLimit,
      downloadCount: grant.downloadCount,
      deliveryTokenAvailable,
      now,
    })

    return {
      grantId: grant.id,
      orderItemId: grant.orderItemId,
      digitalAssetId: grant.digitalAssetId,
      fileName: String(grant.digitalAsset.fileName || '').trim() || 'download',
      title:
        String(grant.digitalAsset.title || '').trim() ||
        String(grant.digitalAsset.fileName || '').trim() ||
        'Digital download',
      status,
      downloadCount: grant.downloadCount,
      downloadLimit: grant.downloadLimit,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      lastDownloadedAt: grant.lastDownloadedAt,
      deliveryEmailStatus: latestDeliveryEmail?.status || null,
      deliveryTokenAvailable,
      events: grant.events.map((event) => ({
        id: event.id,
        result: event.result,
        label: toEventLabel(event.result),
        occurredAt: event.occurredAt,
      })),
    }
  })

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    hasDigitalItems: order.hasDigitalItems,
    pending: order.hasDigitalItems && (grants.length === 0 || grants.some((grant) => grant.status === 'PENDING')),
    deliveryEmailStatus: latestDeliveryEmail?.status || null,
    deliveryEmailLastSentAt: latestDeliveryEmail?.sentAt || null,
    grants,
  } satisfies OrderDigitalDeliverySummary
}

export async function getAdminDigitalDownloadLink(grantId: string): Promise<AdminDigitalDownloadLink> {
  const storeId = await resolveStoreId()
  const grant = await getStoreScopedGrant(grantId, storeId)
  const token = decryptStoredToken(grant.delivery?.tokenEnc)

  if (!token) {
    throw new DigitalDeliveryAdminServiceError(
      'DELIVERY_TOKEN_UNAVAILABLE',
      'Download link is not available for this grant yet',
      409
    )
  }

  return {
    grantId: grant.id,
    downloadUrl: buildDownloadPath(token),
  }
}

export async function resendOrderDigitalDownloads(
  orderId: string
): Promise<ResendOrderDigitalDownloadsResult> {
  const storeId = await resolveStoreId()
  const order = await getOrderDigitalContext(orderId, storeId)

  if (!order.hasDigitalItems || order.grants.length === 0) {
    return {
      queued: false,
      reason: 'NO_DIGITAL_GRANTS',
      message: 'No digital delivery grants are available for this order',
    }
  }

  if (!order.email) {
    return {
      queued: false,
      reason: 'MISSING_CUSTOMER_EMAIL',
      message: 'Order is missing a customer email address',
    }
  }

  const rotatedMissingDeliveryTokens = await prisma.$transaction(async (tx) => {
    let rotated = 0
    for (const grant of order.grants) {
      const ensured = await ensureDigitalDownloadDeliveryToken({
        tx,
        grantId: grant.id,
      })
      if (ensured.rotatedGrantToken) {
        rotated += 1
      }
    }
    return rotated
  })

  const queued = await queueOrderConfirmationEmailDelivery({
    orderId: order.id,
    orderNumber: order.orderNumber,
    email: order.email,
  })

  return {
    queued: true,
    orderId: order.id,
    orderNumber: order.orderNumber,
    emailDeliveryId: queued.delivery.id,
    emailDeliveryStatus: queued.delivery.status,
    jobId: queued.job.id,
    rotatedMissingDeliveryTokens,
  }
}

export async function revokeDigitalDownloadGrant(
  grantId: string
): Promise<RevokeDigitalDownloadGrantResult> {
  const storeId = await resolveStoreId()
  const now = new Date()

  const revoked = await prisma.digitalDownloadGrant.updateMany({
    where: {
      id: grantId,
      storeId,
      revokedAt: null,
    },
    data: {
      revokedAt: now,
    },
  })

  if (revoked.count > 0) {
    return {
      grantId,
      revokedAt: now,
      alreadyRevoked: false,
    }
  }

  const existing = await prisma.digitalDownloadGrant.findFirst({
    where: {
      id: grantId,
      storeId,
    },
    select: {
      revokedAt: true,
    },
  })

  if (!existing) {
    throw new DigitalDeliveryAdminServiceError('GRANT_NOT_FOUND', 'Digital download grant not found', 404)
  }

  return {
    grantId,
    revokedAt: existing.revokedAt || now,
    alreadyRevoked: true,
  }
}

export async function regenerateDigitalDownloadGrant(
  grantId: string
): Promise<RegenerateDigitalDownloadGrantResult> {
  const storeId = await resolveStoreId()
  const grant = await getStoreScopedGrant(grantId, storeId)

  let rawToken: string | null = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    rawToken = createDownloadToken()
    const tokenHash = hashDownloadToken(rawToken)

    try {
      await prisma.$transaction(async (tx) => {
        await tx.digitalDownloadGrant.update({
          where: { id: grant.id },
          data: {
            tokenHash,
          },
        })

        if (grant.delivery?.id) {
          await tx.digitalDownloadDelivery.update({
            where: { id: grant.delivery.id },
            data: {
              tokenEnc: encrypt(rawToken as string),
            },
          })
        } else {
          await tx.digitalDownloadDelivery.create({
            data: {
              grantId: grant.id,
              tokenEnc: encrypt(rawToken as string),
            },
          })
        }
      })

      break
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        rawToken = null
        continue
      }
      throw error
    }
  }

  if (!rawToken) {
    throw new DigitalDeliveryAdminServiceError(
      'TOKEN_REGEN_FAILED',
      'Could not regenerate download token. Please try again.',
      500
    )
  }

  const status = resolveGrantStatus({
    revokedAt: grant.revokedAt,
    expiresAt: grant.expiresAt,
    downloadLimit: grant.downloadLimit,
    downloadCount: grant.downloadCount,
    deliveryTokenAvailable: true,
    now: new Date(),
  })

  return {
    grantId: grant.id,
    downloadUrl: buildDownloadPath(rawToken),
    preservedDownloadCount: true,
    downloadCount: grant.downloadCount,
    downloadLimit: grant.downloadLimit,
    status,
  }
}
