import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/server/utils/crypto'

vi.mock('@/server/auth/require-auth', () => ({
  requireOwner: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: 'owner-1', email: 'owner@example.com', firstName: null, lastName: null, role: 'OWNER' },
  }),
}))

import { PUT } from './route'

const runIntegration =
  process.env.DATABASE_URL_TEST && process.env.DATABASE_URL === process.env.DATABASE_URL_TEST
    ? describe
    : describe.skip

async function cleanTestData() {
  await prisma.outboundWebhookDelivery.deleteMany()
  await prisma.integrationSecret.deleteMany()
  await prisma.integrationEvent.deleteMany()
  await prisma.integration.deleteMany()
}

runIntegration('settings integrations route integration', () => {
  beforeEach(async () => {
    await cleanTestData()
  }, 60_000)

  afterAll(async () => {
    await cleanTestData()
    await prisma.$disconnect()
  }, 60_000)

  it('preserves signing and header secrets unless explicitly changed', async () => {
    const integration = await prisma.integration.create({
      data: {
        name: 'Preserve Secret Integration',
        type: 'CUSTOM',
        webhookUrl: 'https://merchant.example/original',
        webhookSecret: encrypt('signing-secret-original'),
        status: 'ACTIVE',
        events: {
          create: [{ event: 'order.paid' }],
        },
        secrets: {
          create: [
            { key: 'HEADER_X-Preserve', value: encrypt('header-original') },
            { key: 'HEADER_X-Replace', value: encrypt('header-replace-original') },
          ],
        },
      },
      include: {
        secrets: true,
      },
    })

    const originalWebhookSecret = integration.webhookSecret
    const originalHeaderPreserve = integration.secrets.find((secret) => secret.key === 'HEADER_X-Preserve')?.value
    const originalHeaderReplace = integration.secrets.find((secret) => secret.key === 'HEADER_X-Replace')?.value

    expect(originalWebhookSecret).toBeTruthy()
    expect(originalHeaderPreserve).toBeTruthy()
    expect(originalHeaderReplace).toBeTruthy()

    const response = await PUT(
      new Request(`http://localhost/api/settings/integrations/${integration.id}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Preserve Secret Integration Updated',
          webhookUrl: 'https://merchant.example/updated',
          events: ['order.paid', 'order.refunded'],
          secrets: [
            { key: 'HEADER_X-Preserve' },
            { key: 'HEADER_X-Replace', value: 'header-replaced' },
            { key: 'HEADER_X-New', value: 'header-new' },
          ],
        }),
      }),
      { params: Promise.resolve({ id: integration.id }) }
    )

    expect(response.status).toBe(200)

    const payload = await response.json()
    expect(payload.success).toBe(true)

    const updated = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
      include: {
        events: true,
        secrets: true,
      },
    })

    expect(updated.name).toBe('Preserve Secret Integration Updated')
    expect(updated.webhookUrl).toBe('https://merchant.example/updated')
    expect(updated.webhookSecret).toBe(originalWebhookSecret)
    expect(updated.webhookSecret ? decrypt(updated.webhookSecret) : null).toBe('signing-secret-original')

    const preservedHeader = updated.secrets.find((secret) => secret.key === 'HEADER_X-Preserve')
    const replacedHeader = updated.secrets.find((secret) => secret.key === 'HEADER_X-Replace')
    const newHeader = updated.secrets.find((secret) => secret.key === 'HEADER_X-New')

    expect(preservedHeader?.value).toBe(originalHeaderPreserve)
    expect(preservedHeader ? decrypt(preservedHeader.value) : null).toBe('header-original')

    expect(replacedHeader?.value).not.toBe(originalHeaderReplace)
    expect(replacedHeader ? decrypt(replacedHeader.value) : null).toBe('header-replaced')

    expect(newHeader).toBeTruthy()
    expect(newHeader ? decrypt(newHeader.value) : null).toBe('header-new')

    const eventNames = updated.events.map((event) => event.event).sort()
    expect(eventNames).toEqual(['order.paid', 'order.refunded'])
  })

  it('clears webhook signing secret only when explicitly requested', async () => {
    const integration = await prisma.integration.create({
      data: {
        name: 'Clear Secret Integration',
        type: 'CUSTOM',
        webhookUrl: 'https://merchant.example/clear',
        webhookSecret: encrypt('signing-secret-clear-me'),
        status: 'ACTIVE',
      },
    })

    const response = await PUT(
      new Request(`http://localhost/api/settings/integrations/${integration.id}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          clearWebhookSecret: true,
        }),
      }),
      { params: Promise.resolve({ id: integration.id }) }
    )

    expect(response.status).toBe(200)

    const updated = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    })

    expect(updated.webhookSecret).toBeNull()
  })
})
