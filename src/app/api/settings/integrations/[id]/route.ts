import { ok, err } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireOwner } from '@/server/auth/require-auth'
import { encrypt } from '@/server/utils/crypto'
import { z } from 'zod'

export const runtime = 'nodejs'
const BUILT_IN_PROVIDER_TYPES = new Set([
  'PAYMENT_STRIPE',
  'SHIPPING_SHIPPO',
  'SHIPPING_EASYPOST',
  'EMAIL_RESEND',
  'EMAIL_SMTP',
])

const safeIntegrationSelect = {
  id: true,
  name: true,
  type: true,
  webhookUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  events: true,
  secrets: { select: { id: true, key: true } },
} as const

function safeIntegrationResponse(integration: {
  id: string
  name: string
  type: string
  webhookUrl: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  events: unknown
  secrets: unknown
}) {
  return {
    id: integration.id,
    name: integration.name,
    type: integration.type,
    webhookUrl: integration.webhookUrl,
    status: integration.status,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
    events: integration.events,
    secrets: integration.secrets,
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional().or(z.literal('')),
  webhookSecret: z.string().optional(),
  clearWebhookSecret: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  events: z.array(z.string()).optional(),
  secrets: z.array(z.object({
    key: z.string(),
    value: z.string().optional()
  })).optional()
})

function uniqueStrings(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function sanitizeSecretKeys(secrets: Array<{ key: string; value?: string }> | undefined) {
  const seen = new Set<string>()
  return (secrets ?? [])
    .map((secret) => ({ key: secret.key.trim(), value: secret.value?.trim() ?? '' }))
    .filter((secret) => {
      if (!secret.key || seen.has(secret.key)) return false
      seen.add(secret.key)
      return true
    })
}

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const auth = await requireOwner(_req)
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const integration = await prisma.integration.findUnique({
      where: { id },
      select: safeIntegrationSelect,
    })
    if (!integration) return err('Not found', 404)
    return ok(safeIntegrationResponse(integration))
  } catch (error: any) {
    return err(error.message, 500)
  }
}

export async function PUT(req: Request, { params }: Params) {
  const auth = await requireOwner(req)
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const existing = await prisma.integration.findUnique({ where: { id }, select: { type: true } })
    if (!existing) return err('Not found', 404)
    if (BUILT_IN_PROVIDER_TYPES.has(existing.type)) {
      return err('Built-in provider credentials must be managed through the provider settings routes.', 403)
    }
    const json = await req.json()
    const parsed = updateSchema.parse(json)

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {}
      if (parsed.name) data.name = parsed.name
      if (parsed.type) data.type = parsed.type
      if (parsed.status) data.status = parsed.status
      if (parsed.webhookUrl !== undefined) data.webhookUrl = parsed.webhookUrl || null
      if (parsed.clearWebhookSecret) {
        data.webhookSecret = null
      } else if (parsed.webhookSecret && parsed.webhookSecret.trim()) {
        data.webhookSecret = encrypt(parsed.webhookSecret.trim())
      }

      await tx.integration.update({
        where: { id },
        data
      })

      if (parsed.events !== undefined) {
        const events = uniqueStrings(parsed.events)
        await tx.integrationEvent.deleteMany({ where: { integrationId: id } })
        if (events.length > 0) {
          await tx.integrationEvent.createMany({
            data: events.map(event => ({ integrationId: id, event }))
          })
        }
      }

      if (parsed.secrets !== undefined) {
        const secrets = sanitizeSecretKeys(parsed.secrets)
        const newKeys = secrets.map(s => s.key)
        await tx.integrationSecret.deleteMany({
          where: newKeys.length
            ? { integrationId: id, key: { notIn: newKeys } }
            : { integrationId: id }
        })

        for (const secret of secrets) {
          if (secret.value) {
            await tx.integrationSecret.upsert({
              where: { integrationId_key: { integrationId: id, key: secret.key } },
              create: { integrationId: id, key: secret.key, value: encrypt(secret.value) },
              update: { value: encrypt(secret.value) }
            })
          }
        }
      }

      return tx.integration.findUnique({ where: { id }, select: safeIntegrationSelect })
    })

    return ok(updated ? safeIntegrationResponse(updated) : null)
  } catch (error: any) {
    console.error('Failed to update integration', error)
    return err(error.message, 400)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireOwner(_req)
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const existing = await prisma.integration.findUnique({ where: { id }, select: { type: true } })
    if (!existing) return err('Not found', 404)
    if (BUILT_IN_PROVIDER_TYPES.has(existing.type)) {
      return err('Built-in provider credentials must be managed through the provider settings routes.', 403)
    }
    await prisma.integration.delete({ where: { id } })
    return ok({ success: true })
  } catch (error: any) {
    return err(error.message, 500)
  }
}
