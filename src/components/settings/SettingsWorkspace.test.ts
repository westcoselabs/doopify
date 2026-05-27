import { describe, expect, it } from 'vitest'

import {
  buildCheckoutMethodStatuses,
  buildPaymentActivityRowsFromOrders,
  buildPaymentProviderRows,
} from './payments-settings.helpers'

describe('SettingsWorkspace payment helpers', () => {
  it('derives honest checkout method statuses when Stripe runtime is missing', () => {
    const methods = buildCheckoutMethodStatuses({ source: 'none', mode: 'unknown' })

    const cards = methods.find((entry) => entry.id === 'cards')
    const paypal = methods.find((entry) => entry.id === 'paypal')
    const manual = methods.find((entry) => entry.id === 'manual-invoice')

    expect(cards?.statusLabel).toBe('Needs Stripe')
    expect(paypal?.statusLabel).toBe('Coming soon')
    expect(manual?.statusLabel).toBe('Draft orders')
  })

  it('marks Stripe-dependent methods without faking live-only support', () => {
    const methods = buildCheckoutMethodStatuses({ source: 'db', mode: 'test' })

    expect(methods.find((entry) => entry.id === 'cards')?.statusLabel).toBe('Active')
    expect(methods.find((entry) => entry.id === 'apple-pay')?.statusLabel).toBe('Requires live mode')
    expect(methods.find((entry) => entry.id === 'cash-app')?.statusLabel).toBe('Requires live mode')
    expect(methods.find((entry) => entry.id === 'google-pay')?.statusLabel).toBe('Through Stripe')
  })

  it('keeps PayPal and Manual provider rows honest about runtime readiness', () => {
    const rows = buildPaymentProviderRows({
      stripeSetupStatus: { label: 'Verified', tone: 'success' },
      stripeCheckoutSourceLabel: 'DB verified connection',
      stripeRuntimeModeLabel: 'live',
      stripeWebhookSourceLabel: 'DB verified webhook secret',
      stripeSavedStatusLoading: false,
      stripeLastCheckedText: '16 minutes ago',
      stripeMethodChips: ['Cards'],
    })

    const stripe = rows.find((entry) => entry.id === 'STRIPE')
    const paypal = rows.find((entry) => entry.id === 'PAYPAL')
    const manual = rows.find((entry) => entry.id === 'MANUAL')

    expect(stripe?.status).toEqual(expect.objectContaining({ label: 'Verified', tone: 'success' }))
    expect(stripe?.sourceMeta).toContain('Checkout source')
    expect(stripe?.lastCheckedMeta).toContain('Last checked')
    expect(paypal?.status?.label).toBe('Coming soon')
    expect(paypal?.sourceMeta).toContain('unavailable')
    expect(manual?.status?.label).toBe('Built-in')
    expect(manual?.statusMeta).toContain('Storefront manual checkout should remain disabled')
  })

  it('keeps Stripe provider row neutral while saved status is still loading', () => {
    const rows = buildPaymentProviderRows({
      stripeSetupStatus: { label: 'Loading saved status...', tone: 'neutral' },
      stripeCheckoutSourceLabel: 'Not configured',
      stripeRuntimeModeLabel: 'unknown',
      stripeWebhookSourceLabel: 'missing',
      stripeSavedStatusLoading: true,
      stripeLastCheckedText: null,
      stripeMethodChips: ['Cards'],
    })

    const stripe = rows.find((entry) => entry.id === 'STRIPE')
    expect(stripe?.status).toBeNull()
    expect(stripe?.statusLoading).toBe(true)
  })

  it('builds payment activity rows from order payment records and sorts newest first', () => {
    const rows = buildPaymentActivityRowsFromOrders([
      {
        id: 'ord_1',
        orderNumber: 1001,
        currency: 'USD',
        createdAt: '2026-04-30T10:00:00.000Z',
        payments: [
          {
            id: 'pay_1',
            provider: 'stripe',
            status: 'PAID',
            amountCents: 2199,
            currency: 'USD',
            stripePaymentIntentId: 'pi_newer',
            createdAt: '2026-04-30T10:05:00.000Z',
          },
        ],
      },
      {
        id: 'ord_2',
        orderNumber: 1000,
        currency: 'USD',
        createdAt: '2026-04-30T09:00:00.000Z',
        payments: [
          {
            id: 'pay_2',
            provider: 'stripe',
            status: 'FAILED',
            amountCents: 1500,
            currency: 'USD',
            stripePaymentIntentId: 'pi_older',
            createdAt: '2026-04-30T09:05:00.000Z',
          },
        ],
      },
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0].referenceText).toBe('pi_newer')
    expect(rows[0].eventText).toBe('Payment captured')
    expect(rows[1].referenceText).toBe('pi_older')
    expect(rows[1].eventText).toBe('Payment failed')
  })
})
