import { afterEach, describe, expect, it, vi } from 'vitest'

import { shippoProviderAdapter } from './shippo'

function createResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('shippoProviderAdapter.purchaseLabel', () => {
  it('maps a successful Shippo transaction payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createResponse({
          status: 'SUCCESS',
          object_id: 'tx_1',
          shipment: 'shipment_1',
          carrier: 'USPS',
          servicelevel_name: 'Priority Mail',
          label_url: 'https://labels.example.com/tx_1.pdf',
          tracking_number: 'TRACK123',
          tracking_url_provider: 'https://track.example.com/TRACK123',
          amount: '6.42',
          currency: 'USD',
          rate: {
            object_id: 'rate_1',
            amount: '6.42',
            currency: 'USD',
          },
        })
      )
    )

    const result = await shippoProviderAdapter.purchaseLabel({
      apiKey: 'shippo_test_key',
      rateId: 'rate_1',
      shipmentId: 'shipment_1',
      request: {} as never,
    })

    expect(result).toMatchObject({
      providerShipmentId: 'shipment_1',
      providerRateId: 'rate_1',
      providerLabelId: 'tx_1',
      carrier: 'USPS',
      service: 'Priority Mail',
      trackingNumber: 'TRACK123',
      labelAmountCents: 642,
      currency: 'USD',
    })
  })

  it('passes origin email in Shippo rate payload when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        object_id: 'shipment_1',
        rates: [
          {
            object_id: 'rate_1',
            amount: '6.42',
            currency: 'USD',
            provider: { carrier: 'USPS' },
            servicelevel: { name: 'Priority Mail' },
          },
        ],
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await shippoProviderAdapter.getRates({
      apiKey: 'shippo_test_key',
      currency: 'USD',
      originAddress: {
        name: 'Warehouse',
        phone: '555-000-0000',
        email: 'shipping@example.com',
        address1: '10 Main St',
        city: 'Austin',
        province: 'TX',
        postalCode: '78701',
        country: 'US',
      },
      destinationAddress: {
        name: 'Buyer',
        address1: '20 Market St',
        city: 'New York',
        province: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      parcel: {
        weightOz: 12,
        lengthIn: 10,
        widthIn: 8,
        heightIn: 4,
      },
    })

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(payload.address_from.email).toBe('shipping@example.com')
  })

  it('maps missing ship-from email provider error to merchant-safe copy without leaking raw payload', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createResponse({
          status: 'ERROR',
          shipment: 'shipment_1',
          messages: [
            {
              code: 'user_input_problem',
              source: 'USPS',
              text: 'Attribute "address_from.email" must not be empty.',
            },
          ],
        })
      )
    )

    await expect(
      shippoProviderAdapter.purchaseLabel({
        apiKey: 'shippo_test_key',
        rateId: 'rate_1',
        shipmentId: 'shipment_1',
        request: {} as never,
      })
    ).rejects.toThrow(
      'Shippo label purchase failed: Ship-from email is missing. Add an email to your shipping location or store profile.'
    )

    expect(errorSpy).toHaveBeenCalled()
    const thrown = await shippoProviderAdapter
      .purchaseLabel({
        apiKey: 'shippo_test_key',
        rateId: 'rate_1',
        shipmentId: 'shipment_1',
        request: {} as never,
      })
      .catch((error: Error) => error.message)
    expect(String(thrown)).not.toContain('shippo_test_key')
    expect(String(thrown)).not.toContain('address_from.email')
  })

  it('maps sender_info_missing to a ship-from contact setup message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createResponse({
          status: 'ERROR',
          shipment: 'shipment_1',
          messages: [
            {
              code: 'sender_info_missing',
              text: 'Seller info missing email or phone. Seller email and phone number required for USPS.',
            },
          ],
        })
      )
    )

    await expect(
      shippoProviderAdapter.purchaseLabel({
        apiKey: 'shippo_test_key',
        rateId: 'rate_1',
        shipmentId: 'shipment_1',
        request: {} as never,
      })
    ).rejects.toThrow(
      'Shippo label purchase failed: Shippo requires a ship-from email and phone number for USPS labels. Add them to your shipping location or store profile.'
    )
  })
})
