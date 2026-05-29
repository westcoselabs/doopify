import { err, ok, parseBody } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/auth/require-auth'
import {
  getMediaPublicUrl,
  getMediaStorageAdapter,
  getMediaStorageAdapterForProvider,
  MediaStorageConfigError,
} from '@/server/media/media-storage'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

interface Params {
  params: Promise<{ assetId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { assetId } = await params
    const asset = await getMediaStorageAdapter().get(assetId)
    if (!asset) return err('Asset not found', 404)
    if (asset.redirectUrl) {
      return NextResponse.redirect(asset.redirectUrl, {
        status: 302,
        headers: {
          'Cache-Control': asset.cacheControl,
        },
      })
    }
    if (!asset.body) return err('Asset not found', 404)

    return new NextResponse(new Uint8Array(asset.body), {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Content-Disposition': `inline; filename="${asset.filename}"`,
        'Cache-Control': asset.cacheControl,
      },
    })
  } catch (e) {
    console.error('[GET /api/media/[assetId]]', e)
    return err('Failed to fetch asset', 500)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  const body = await parseBody<{ altText?: string }>(req)
  if (!body) return err('Invalid request body')

  try {
    const { assetId } = await params
    const asset = await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        altText: body.altText?.trim() || null,
      },
      select: {
        id: true,
        filename: true,
        altText: true,
        mimeType: true,
        size: true,
        createdAt: true,
        productMedia: {
          orderBy: { position: 'asc' },
          take: 4,
          select: {
            product: {
              select: {
                id: true,
                title: true,
                handle: true,
              },
            },
          },
        },
        _count: {
          select: {
            productMedia: true,
          },
        },
      },
    })

    return ok({
      id: asset.id,
      filename: asset.filename,
      altText: asset.altText,
      mimeType: asset.mimeType,
      size: asset.size,
      createdAt: asset.createdAt,
      linkedProducts: asset._count.productMedia,
      products: asset.productMedia.map((media) => media.product),
        url: getMediaPublicUrl(asset.id),
    })
  } catch (e) {
    console.error('[PATCH /api/media/[assetId]]', e)
    return err('Failed to update asset metadata', 500)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdmin(_req)
  if (!auth.ok) return auth.response

  try {
    const { assetId } = await params
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        storageProvider: true,
      },
    })

    if (!asset) {
      return err('Asset not found', 404)
    }

    const store = await prisma.store.findFirst({
      select: {
        id: true,
        logoUrl: true,
        faviconUrl: true,
        emailLogoUrl: true,
        checkoutLogoUrl: true,
      },
    })

    const assetPublicUrl = getMediaPublicUrl(assetId)
    const isUsedInBranding = Boolean(
      store &&
        [store.logoUrl, store.faviconUrl, store.emailLogoUrl, store.checkoutLogoUrl].some(
          (value) => value === assetPublicUrl
        )
    )

    if (isUsedInBranding) {
      return err('This image is currently used in store branding. Update branding first, then delete it.', 409)
    }

    const adapter = getMediaStorageAdapterForProvider(asset.storageProvider)
    await adapter.delete(assetId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[DELETE /api/media/[assetId]]', error)

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2025' || error.code === 'P2001')
    ) {
      return err('Asset not found', 404)
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      return err('This asset is currently in use and cannot be deleted yet.', 409)
    }

    if (error instanceof Error && error.message.toLowerCase() === 'asset not found') {
      return err('Asset not found', 404)
    }

    if (error instanceof MediaStorageConfigError) {
      return err('Media storage is not configured for this asset.', 500)
    }

    return err('Failed to delete asset', 500)
  }
}
