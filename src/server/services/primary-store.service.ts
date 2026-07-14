import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

const PRIMARY_STORE_KEY = 'PRIMARY'

/**
 * Resolves the one store used by this single-store application. New databases
 * use singletonKey; legacy databases fall back deterministically by creation
 * time and ID while emitting only safe ambiguity metadata.
 */
export async function findPrimaryStore<T extends Prisma.StoreFindFirstArgs>(
  query: Prisma.SelectSubset<T, Prisma.StoreFindFirstArgs> = {} as Prisma.SelectSubset<T, Prisma.StoreFindFirstArgs>
): Promise<Prisma.StoreGetPayload<T> | null> {
  const { where, orderBy: _orderBy, ...rest } = query as Prisma.StoreFindFirstArgs
  const canonical = await prisma.store.findFirst({
    ...rest,
    where: { ...where, singletonKey: PRIMARY_STORE_KEY },
  } as Prisma.StoreFindFirstArgs)
  if (canonical) return canonical as Prisma.StoreGetPayload<T>

  const legacyRows = await prisma.store.findMany({
    where,
    select: { id: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 2,
  } as Prisma.StoreFindManyArgs)
  if (legacyRows.length > 1) {
    console.warn('[primary-store] No PRIMARY singletonKey found; using deterministic legacy fallback.', {
      duplicateCountAtLeast: 2,
    })
  }
  if (!legacyRows.length) return null

  const legacy = await prisma.store.findFirst({
    ...rest,
    where,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  } as Prisma.StoreFindFirstArgs)
  return legacy as Prisma.StoreGetPayload<T> | null
}

export async function createPrimaryStore(args: { data: Record<string, unknown>; [key: string]: unknown }) {
  const { data, ...rest } = args
  return prisma.store.create({ ...rest, data: { ...data, singletonKey: PRIMARY_STORE_KEY } } as never)
}

export { PRIMARY_STORE_KEY }
