import { ok, err } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/server/auth/require-auth'
import { encrypt } from '@/server/utils/crypto'
import { z } from 'zod'

export const runtime = 'nodejs'
const DEFAULT_INTEGRATION_LIST_PAGE_SIZE = 25
const MAX_INTEGRATION_LIST_PAGE_SIZE = 100

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  webhookSecret: z.string().optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  events: z.array(z.string()).optional(),
  secrets: z.array(z.object({
    key: z.string(),
    value: z.string()
  })).optional()
})

function uniqueStrings(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function sanitizeSecrets(secrets: Array<{ key: string; value?: string }> | undefined) {
  const seen = new Set<string>()
  return (secrets ?? [])
    .map((secret) => ({ key: secret.key.trim(), value: secret.value?.trim() ?? '' }))
    .filter((secret) => {
      if (!secret.key || !secret.value || seen.has(secret.key)) return false
      seen.add(secret.key)
      return true
    })
}

function clampPage(value: number) {
  return Math.max(1, Math.floor(Number(value || 1)))
}

function clampPageSize(value: number) {
  return Math.max(
    1,
    Math.min(MAX_INTEGRATION_LIST_PAGE_SIZE, Math.floor(Number(value || DEFAULT_INTEGRATION_LIST_PAGE_SIZE)))
  )
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(req.url)
    const page = clampPage(Number(searchParams.get('page') || 1))
    const pageSize = clampPageSize(Number(searchParams.get('pageSize') || DEFAULT_INTEGRATION_LIST_PAGE_SIZE))

    const [rows, total] = await Promise.all([
      prisma.integration.findMany({
        select: {
          id: true,
          name: true,
          type: true,
          webhookUrl: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              events: true,
              secrets: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.integration.count(),
    ])

    return ok({
      integrations: rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        webhookUrl: row.webhookUrl,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        eventCount: row._count.events,
        secretCount: row._count.secrets,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error: any) {
    console.error('Failed to get integrations', error)
    return err(error.message, 500)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth.response

  try {
    const json = await req.json()
    const parsed = createSchema.parse(json)
    const events = uniqueStrings(parsed.events)
    const secrets = sanitizeSecrets(parsed.secrets)

    const integration = await prisma.integration.create({
      data: {
        name: parsed.name,
        type: parsed.type,
        webhookUrl: parsed.webhookUrl || null,
        webhookSecret: parsed.webhookSecret ? encrypt(parsed.webhookSecret) : null,
        status: parsed.status,
        events: events.length ? {
          create: events.map(event => ({ event }))
        } : undefined,
        secrets: secrets.length ? {
          create: secrets.map(s => ({
            key: s.key,
            value: encrypt(s.value)
          }))
        } : undefined
      },
      include: { events: true, secrets: { select: { id: true, key: true } } }
    })

    return ok(integration)
  } catch (error: any) {
    console.error('Failed to create integration', error)
    return err(error.message, 400)
  }
}
