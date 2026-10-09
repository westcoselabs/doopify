import type { Prisma } from '@prisma/client'

// Catalog queries never need the stored image bytes or object-storage internals.
export const catalogMediaSelect = {
  id: true,
  filename: true,
  altText: true,
  mimeType: true,
  size: true,
  width: true,
  height: true,
  createdAt: true,
} satisfies Prisma.MediaAssetSelect

export function catalogPagination(input: { page?: unknown; pageSize?: unknown } = {}, defaultPageSize = 24) {
  const pageValue = Number(input.page)
  const sizeValue = Number(input.pageSize)
  const page = Number.isFinite(pageValue) && pageValue > 0 ? Math.min(1_000_000, Math.floor(pageValue)) : 1
  const pageSize = Number.isFinite(sizeValue) && sizeValue > 0 ? Math.min(100, Math.floor(sizeValue)) : defaultPageSize
  return { page: Math.max(1, page), pageSize: Math.max(1, pageSize) }
}

export function storefrontVisibleProductWhere(now = new Date()): Prisma.ProductWhereInput {
  return { status: 'ACTIVE', OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] }
}
