import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeTags(tags: string[] = []) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

// ── List customers ────────────────────────────────────────────────────────────
export async function getCustomers(params: {
  search?: string
  page?: number
  pageSize?: number
}) {
  const { search, page = 1, pageSize = 20 } = params

  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { addresses: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ])

  return {
    customers,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

// ── Get single customer with order history ────────────────────────────────────
export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { items: true },
      },
    },
  })
}

// ── Get customer by email ─────────────────────────────────────────────────────
export async function getCustomerByEmail(email: string) {
  return prisma.customer.findUnique({
    where: { email: normalizeEmail(email) },
    include: { addresses: true },
  })
}

// ── Create customer ───────────────────────────────────────────────────────────
export async function createCustomer(data: {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  acceptsMarketing?: boolean
  tags?: string[]
  note?: string
  initialAddress?: {
    firstName?: string
    lastName?: string
    company?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    postalCode?: string
    country?: string
    phone?: string
    isDefault?: boolean
  }
}) {
  return prisma.customer.create({
    data: {
      email: normalizeEmail(data.email),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      acceptsMarketing: data.acceptsMarketing ?? false,
      tags: normalizeTags(data.tags),
      note: data.note,
      ...(data.initialAddress ? { addresses: { create: data.initialAddress } } : {}),
    },
    include: { addresses: true },
  })
}

// ── Update customer ───────────────────────────────────────────────────────────
export async function updateCustomer(
  id: string,
  data: Partial<{
    email: string
    firstName: string
    lastName: string
    phone: string
    acceptsMarketing: boolean
    tags: string[]
    note: string
  }>
) {
  return prisma.customer.update({
    where: { id },
    data: {
      ...data,
      ...(data.email ? { email: normalizeEmail(data.email) } : {}),
      ...(data.tags ? { tags: normalizeTags(data.tags) } : {}),
    },
    include: { addresses: true },
  })
}

// ── Add address ───────────────────────────────────────────────────────────────
export async function addCustomerAddress(
  customerId: string,
  data: {
    firstName?: string
    lastName?: string
    company?: string
    address1?: string
    address2?: string
    city?: string
    province?: string
    postalCode?: string
    country?: string
    phone?: string
    isDefault?: boolean
  }
) {
  if (data.isDefault) {
    // Clear any existing default
    await prisma.customerAddress.updateMany({
      where: { customerId },
      data: { isDefault: false },
    })
  }

  return prisma.customerAddress.create({
    data: { customerId, ...data },
  })
}

export async function exportCustomerData(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      addresses: true,
      orders: {
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          addresses: true,
          payments: true,
          refunds: { include: { items: true } },
          returns: { include: { items: true } },
        },
      },
    },
  })

  if (!customer) return null

  return {
    exportedAt: new Date().toISOString(),
    customer,
  }
}
