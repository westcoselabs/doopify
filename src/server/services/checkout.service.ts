import { Prisma, type CheckoutSessionStatus } from '@prisma/client'

import { centsToDollars, dollarsToCents } from '@/lib/money'
import { prisma } from '@/lib/prisma'
import { createStripePaymentIntent, type StripePaymentIntent } from '@/lib/stripe'
import {
  classifyCartFulfillment,
  normalizeCartFulfillmentType,
} from '@/lib/checkout/cart-fulfillment'
import {
  buildCheckoutPricingWithDecisionsCents,
  type CheckoutAppliedDiscount,
  type CheckoutPricingShippingDecision,
  type CheckoutPricingTaxDecision,
} from '@/server/checkout/pricing'
import {
  loadAutomaticPromotionsForCheckout,
} from '@/server/promotions/checkout-loader.service'
import type { PromotionApplicationDraft } from '@/server/promotions/contracts'
import { evaluatePromotions } from '@/server/promotions/evaluator'
import {
  buildCheckoutAddressFingerprint,
  buildCheckoutCartFingerprint,
  getStoredCheckoutShippingQuote,
  isCheckoutShippingQuoteId,
  storeCheckoutShippingQuote,
} from '@/server/checkout/shipping-quote-cache'
import { emitInternalEvent } from '@/server/events/dispatcher'
import { getStripeRuntimeConnection } from '@/server/payments/stripe-runtime.service'
import {
  getShippingRatesForCheckout,
} from '@/server/shipping/shipping-rate.service'
import { convertVariantWeightToOz, totalCartWeightOz } from '@/server/shipping/weight-conversion'
import type { ShippingRateQuote } from '@/server/shipping/shipping-rate.types'
import { markCheckoutRecoveredByPaymentIntent } from '@/server/services/abandoned-checkout.service'
import { getBuyerDigitalDownloadAvailabilityForPaidOrder } from '@/server/services/digital-download-delivery.service'
import { issueDigitalDownloadGrantsForPaidOrder } from '@/server/services/digital-grant-issuance.service'
import { canPurchaseVariant } from '@/server/services/product-availability.service'
import { addCustomerAddress, createCustomer, getCustomerByEmail } from '@/server/services/customer.service'
import { createOrder, getOrderByPaymentIntentId } from '@/server/services/order.service'
import { getStoreSettings } from '@/server/services/settings.service'

type CheckoutAddress = {
  firstName?: string
  lastName?: string
  company?: string
  address1: string
  address2?: string
  city: string
  province?: string
  postalCode: string
  country: string
  phone?: string
}

type CheckoutItemInput = {
  variantId: string
  quantity: number
}

type CheckoutPayload = {
  email: string
  items: Array<{
    productId: string
    variantId: string
    title: string
    variantTitle?: string
    sku?: string
    priceCents: number
    quantity: number
    fulfillmentType: 'PHYSICAL' | 'DIGITAL'
  }>
  shippingAddress?: CheckoutAddress
  billingAddress?: CheckoutAddress
  discountApplications?: CheckoutAppliedDiscount[]
  promotionApplications?: CheckoutPromotionApplicationSnapshot[]
  pricingSnapshot?: {
    computedAt: string
    currency: string
    subtotalCents: number
    shippingAmountCents: number
    taxAmountCents: number
    discountAmountCents: number
    codeDiscountAmountCents?: number
    promotionDiscountAmountCents?: number
    totalCents: number
    shippingDecision: CheckoutPricingShippingDecision
    taxDecision: CheckoutPricingTaxDecision
    promotionApplications?: CheckoutPromotionApplicationSnapshot[]
  }
  selectedShippingRate?: {
    id: string
    source: 'MANUAL' | 'EASYPOST' | 'SHIPPO'
    rateType?: 'LIVE_RATE' | 'FALLBACK' | 'FLAT' | 'FREE' | 'WEIGHT_BASED' | 'PRICE_BASED'
    carrier?: string
    service?: string
    displayName: string
    amountCents: number
    currency: string
    estimatedDays?: number
    estimatedDeliveryText?: string
    providerShipmentId?: string
    providerRateId?: string
  }
}

type CheckoutPromotionLineAllocationSnapshot = {
  variantId: string
  quantityDiscounted: number
  discountCents: number
  promotionId: string
  promotionName: string
  promotionType: PromotionApplicationDraft['promotionType']
}

type CheckoutPromotionApplicationSnapshot = {
  promotionId: string
  promotionName: string
  promotionType: PromotionApplicationDraft['promotionType']
  rewardType: PromotionApplicationDraft['rewardType']
  amountCents: number
  lineAllocations: CheckoutPromotionLineAllocationSnapshot[]
  summary: string
}

const MIXED_CART_UNSUPPORTED_MESSAGE = 'Mixed physical and digital carts are not supported yet.'

function allowCheckoutFallbackDefaults() {
  return process.env.NODE_ENV !== 'production' || process.env.CHECKOUT_ALLOW_DEV_FALLBACKS === 'true'
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeAddress(input: CheckoutAddress): CheckoutAddress {
  return {
    firstName: input.firstName?.trim() || undefined,
    lastName: input.lastName?.trim() || undefined,
    company: input.company?.trim() || undefined,
    address1: input.address1.trim(),
    address2: input.address2?.trim() || undefined,
    city: input.city.trim(),
    province: input.province?.trim() || undefined,
    postalCode: input.postalCode.trim(),
    country: input.country.trim(),
    phone: input.phone?.trim() || undefined,
  }
}

function normalizePromotionFulfillmentType(value: string | null | undefined): 'PHYSICAL' | 'DIGITAL' | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  if (normalized === 'PHYSICAL') return 'PHYSICAL'
  if (normalized === 'DIGITAL') return 'DIGITAL'
  return null
}

function getLatestChargeId(intent: StripePaymentIntent) {
  if (!intent.latest_charge) return undefined
  return typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge.id
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function mapCheckoutPricingForPresentation(pricing: {
  subtotalCents?: number
  shippingAmountCents?: number
  taxAmountCents?: number
  discountAmountCents?: number
  totalCents?: number
  subtotal?: number
  shippingAmount?: number
  taxAmount?: number
  discountAmount?: number
  total?: number
}) {
  const subtotalCents = pricing.subtotalCents ?? dollarsToCents(pricing.subtotal ?? 0)
  const shippingAmountCents =
    pricing.shippingAmountCents ?? dollarsToCents(pricing.shippingAmount ?? 0)
  const taxAmountCents = pricing.taxAmountCents ?? dollarsToCents(pricing.taxAmount ?? 0)
  const discountAmountCents =
    pricing.discountAmountCents ?? dollarsToCents(pricing.discountAmount ?? 0)
  const totalCents = pricing.totalCents ?? dollarsToCents(pricing.total ?? 0)

  return {
    subtotal: centsToDollars(subtotalCents),
    shippingAmount: centsToDollars(shippingAmountCents),
    taxAmount: centsToDollars(taxAmountCents),
    discountAmount: centsToDollars(discountAmountCents),
    total: centsToDollars(totalCents),
    subtotalCents,
    shippingAmountCents,
    taxAmountCents,
    discountAmountCents,
    totalCents,
  }
}

function mapShippingQuoteForSnapshot(quote: ShippingRateQuote) {
  return {
    id: quote.id,
    source: quote.source,
    rateType: quote.rateType,
    carrier: quote.carrier,
    service: quote.service,
    displayName: quote.displayName,
    amountCents: quote.amountCents,
    currency: quote.currency,
    estimatedDays: quote.estimatedDays,
    estimatedDeliveryText: quote.estimatedDeliveryText,
    providerShipmentId: quote.providerShipmentId,
    providerRateId: quote.providerRateId,
  }
}

function mapPromotionApplicationForSnapshot(
  promotion: PromotionApplicationDraft
): CheckoutPromotionApplicationSnapshot {
  return {
    promotionId: promotion.promotionId,
    promotionName: promotion.promotionName,
    promotionType: promotion.promotionType,
    rewardType: promotion.rewardType,
    amountCents: promotion.amountCents,
    lineAllocations: promotion.lineAllocations.map((line) => ({
      variantId: line.variantId,
      quantityDiscounted: line.quantityDiscounted,
      discountCents: line.discountCents,
      promotionId: line.promotionId,
      promotionName: line.promotionName,
      promotionType: line.promotionType,
    })),
    summary: promotion.summary,
  }
}

function buildDigitalNoShippingSnapshot(currency: string) {
  return {
    id: 'digital:no-shipping',
    source: 'MANUAL' as const,
    rateType: 'FREE' as const,
    displayName: 'No shipping required (digital delivery pending)',
    amountCents: 0,
    currency,
    estimatedDeliveryText: 'Digital delivery pending',
  }
}

function isProviderBackedQuote(quote: ShippingRateQuote) {
  return quote.source === 'EASYPOST' || quote.source === 'SHIPPO'
}

const SHIPPING_RATES_EXPIRED_MESSAGE =
  'Shipping rates expired. Please refresh shipping options and select a rate again.'

function normalizeShippingQuoteForSelection(input: {
  quote: ShippingRateQuote
  cartFingerprint: string
  addressFingerprint: string
}) {
  if (!isProviderBackedQuote(input.quote)) {
    return {
      ...input.quote,
      selectedShippingQuoteId: input.quote.id,
    }
  }

  const storedQuote = storeCheckoutShippingQuote({
    quote: input.quote,
    cartFingerprint: input.cartFingerprint,
    addressFingerprint: input.addressFingerprint,
  })

  return {
    ...input.quote,
    id: storedQuote.quoteId,
    selectedShippingQuoteId: storedQuote.quoteId,
  }
}

function mapStoredQuoteToShippingRateQuote(input: {
  quoteId: string
  source: ShippingRateQuote['source']
  originalQuoteId: string
  amountCents: number
  currency: string
  carrier?: string
  service?: string
  providerRateId?: string
  providerShipmentId?: string
  estimatedDeliveryText?: string
}): ShippingRateQuote {
  const displayNameParts = [input.carrier, input.service].filter(Boolean)
  const providerLabel = input.source === 'SHIPPO' ? 'Shippo' : 'EasyPost'
  return {
    id: input.quoteId,
    source: input.source,
    rateType: 'LIVE_RATE',
    carrier: input.carrier,
    service: input.service,
    displayName: displayNameParts.length ? displayNameParts.join(' - ') : `${providerLabel} rate`,
    amountCents: input.amountCents,
    currency: input.currency,
    estimatedDeliveryText: input.estimatedDeliveryText,
    providerRateId: input.providerRateId,
    providerShipmentId: input.providerShipmentId,
    metadata: {
      originalQuoteId: input.originalQuoteId,
    },
  }
}


async function resolveLineItems(items: CheckoutItemInput[]) {
  const uniqueVariantIds = Array.from(new Set(items.map((item) => item.variantId)))
  const now = new Date()

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: uniqueVariantIds },
      product: {
        status: 'ACTIVE',
        OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
      },
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          salesMode: true,
          presaleStartsAt: true,
          presaleEndsAt: true,
          availableForPurchaseAt: true,
          availabilityMessage: true,
          fulfillmentType: true,
        },
      },
    },
  })

  const variantMap = new Map(variants.map((variant) => [variant.id, variant]))

  return items.map((item) => {
    const variant = variantMap.get(item.variantId)
    if (!variant) {
      throw new Error(`Variant ${item.variantId} could not be found`)
    }

    const purchasable = canPurchaseVariant(
      {
        salesMode: variant.product.salesMode,
        presaleStartsAt: variant.product.presaleStartsAt,
        presaleEndsAt: variant.product.presaleEndsAt,
        availableForPurchaseAt: variant.product.availableForPurchaseAt,
        availabilityMessage: variant.product.availabilityMessage,
        fulfillmentType: variant.product.fulfillmentType,
      },
      {
        inventory: variant.inventory,
        continueSellingWhenOutOfStock: variant.continueSellingWhenOutOfStock,
      },
      item.quantity,
      now
    )

    if (!purchasable.ok) {
      throw new Error(purchasable.reason || `${variant.product.title} is not available for purchase`)
    }

    return {
      productId: variant.productId,
      variantId: variant.id,
      title: variant.product.title,
      variantTitle: variant.title,
      sku: variant.sku ?? undefined,
      priceCents: variant.priceCents ?? dollarsToCents((variant as { price?: number }).price ?? 0),
      weightOz: convertVariantWeightToOz(variant.weight, variant.weightUnit),
      quantity: item.quantity,
      fulfillmentType: normalizeCartFulfillmentType(variant.product.fulfillmentType),
      promotionFulfillmentType: normalizePromotionFulfillmentType(variant.product.fulfillmentType),
    }
  })
}

function toShippingRateAddress(address: CheckoutAddress) {
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(' ').trim() || null,
    phone: address.phone ?? null,
    address1: address.address1,
    address2: address.address2 ?? null,
    city: address.city,
    province: address.province ?? null,
    postalCode: address.postalCode,
    country: address.country,
  }
}

function subtotalFromLineItems(lineItems: Array<{ priceCents: number; quantity: number }>) {
  return lineItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0)
}

async function resolveSelectedShippingQuote(input: {
  shippingMode?: string | null
  storeId?: string
  lineItems: Array<{ variantId: string; priceCents: number; weightOz?: number; quantity: number }>
  shippingAddress: CheckoutAddress
  selectedShippingQuoteId?: string
}) {
  const requiresSelection = input.shippingMode === 'LIVE_RATES' || input.shippingMode === 'HYBRID'
  if (requiresSelection && !input.selectedShippingQuoteId?.trim()) {
    throw new Error('Select a shipping option before continuing to payment.')
  }

  const selectedShippingQuoteId = input.selectedShippingQuoteId?.trim()
  const cartFingerprint = buildCheckoutCartFingerprint(
    input.lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      priceCents: item.priceCents,
    }))
  )
  const addressFingerprint = buildCheckoutAddressFingerprint(input.shippingAddress)

  if (selectedShippingQuoteId) {
    const storedQuote = getStoredCheckoutShippingQuote(selectedShippingQuoteId)
    if (storedQuote) {
      if (
        storedQuote.cartFingerprint !== cartFingerprint ||
        storedQuote.addressFingerprint !== addressFingerprint
      ) {
        throw new Error(SHIPPING_RATES_EXPIRED_MESSAGE)
      }

      if (storedQuote.provider) {
        if (
          !storedQuote.providerRateId ||
          !Number.isInteger(storedQuote.amountCents) ||
          storedQuote.amountCents < 0 ||
          !storedQuote.currency
        ) {
          throw new Error(SHIPPING_RATES_EXPIRED_MESSAGE)
        }

        const selectedQuote = mapStoredQuoteToShippingRateQuote({
          quoteId: storedQuote.quoteId,
          originalQuoteId: storedQuote.originalQuoteId,
          source: storedQuote.source,
          amountCents: storedQuote.amountCents,
          currency: storedQuote.currency,
          carrier: storedQuote.carrier,
          service: storedQuote.service,
          providerRateId: storedQuote.providerRateId,
          providerShipmentId: storedQuote.providerShipmentId,
          estimatedDeliveryText: storedQuote.estimatedDeliveryText,
        })

        return {
          selectedQuote,
          quotes: [selectedQuote],
        }
      }
    } else if (isCheckoutShippingQuoteId(selectedShippingQuoteId)) {
      throw new Error(SHIPPING_RATES_EXPIRED_MESSAGE)
    }
  }

  const totalWeightOz = totalCartWeightOz(input.lineItems)

  const quotes = await getShippingRatesForCheckout({
    storeId: input.storeId,
    subtotalCents: subtotalFromLineItems(input.lineItems),
    totalWeightOz,
    shippingAddress: toShippingRateAddress(input.shippingAddress),
  })

  if (!quotes.length) {
    throw new Error('No shipping rates are available for this checkout')
  }

  const selectedQuote = selectedShippingQuoteId
    ? quotes.find((quote) => quote.id === selectedShippingQuoteId)
    : quotes[0]

  if (!selectedQuote) {
    throw new Error('Selected shipping option is no longer available. Please refresh shipping options and try again.')
  }

  return {
    selectedQuote,
    quotes,
  }
}

async function resolveDiscountCode(discountCode?: string) {
  const code = discountCode?.trim().toUpperCase()
  if (!code) {
    return null
  }

  const discount = await prisma.discount.findUnique({
    where: { code },
  })

  if (!discount) {
    throw new Error('Discount code not found')
  }

  return discount
}

async function resolveCheckoutCustomer(payload: CheckoutPayload) {
  let customer = await getCustomerByEmail(payload.email)
  const primaryAddress = payload.shippingAddress ?? payload.billingAddress

  if (!customer) {
    try {
      customer = await createCustomer({
        email: payload.email,
        firstName: primaryAddress?.firstName,
        lastName: primaryAddress?.lastName,
        phone: primaryAddress?.phone,
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }

      customer = await getCustomerByEmail(payload.email)
      if (!customer) {
        throw error
      }
    }
  }

  if (
    customer &&
    customer.addresses.length === 0 &&
    primaryAddress?.address1 &&
    primaryAddress?.city &&
    primaryAddress?.postalCode &&
    primaryAddress?.country
  ) {
    await addCustomerAddress(customer.id, {
      firstName: primaryAddress.firstName,
      lastName: primaryAddress.lastName,
      company: primaryAddress.company,
      address1: primaryAddress.address1,
      address2: primaryAddress.address2,
      city: primaryAddress.city,
      province: primaryAddress.province,
      postalCode: primaryAddress.postalCode,
      country: primaryAddress.country,
      phone: primaryAddress.phone,
      isDefault: true,
    })
  }

  return customer
}

export async function createCheckoutPaymentIntent(input: {
  email: string
  items: CheckoutItemInput[]
  shippingAddress?: CheckoutAddress
  billingAddress?: CheckoutAddress
  discountCode?: string
  selectedShippingQuoteId?: string
}) {
  const store = await getStoreSettings()
  const normalizedEmail = normalizeEmail(input.email)
  const lineItems = await resolveLineItems(input.items)
  const cartFulfillment = classifyCartFulfillment(lineItems)
  if (cartFulfillment === 'MIXED') {
    throw new Error(MIXED_CART_UNSUPPORTED_MESSAGE)
  }

  const requiresShipping = cartFulfillment === 'PHYSICAL_ONLY'
  if (requiresShipping && !input.shippingAddress) {
    throw new Error('Shipping address is required for physical products.')
  }

  const shippingAddress = input.shippingAddress ? normalizeAddress(input.shippingAddress) : undefined
  const billingAddress = input.billingAddress
    ? normalizeAddress(input.billingAddress)
    : shippingAddress
  const discount = await resolveDiscountCode(input.discountCode)
  const promotionLoadResult = await loadAutomaticPromotionsForCheckout()
  const promotionEvaluation = evaluatePromotions(
    {
      cartLines: lineItems.map((item) => ({
        variantId: item.variantId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceCents: item.priceCents,
        fulfillmentType: item.promotionFulfillmentType,
      })),
      promotions: promotionLoadResult.promotions,
      discountCode: discount?.code ?? null,
    },
    {
      codeDiscountApplied: Boolean(discount),
      physicalOnly: true,
    }
  )
  const promotionApplications = promotionEvaluation.appliedPromotions.map(mapPromotionApplicationForSnapshot)
  const promotionDiscountAmountCents = promotionEvaluation.totalDiscountCents
  const currency = (store?.currency || 'USD').toUpperCase()
  const shippingResolution = requiresShipping
    ? await resolveSelectedShippingQuote({
        shippingMode: store?.shippingMode,
        storeId: store?.id,
        lineItems,
        shippingAddress: shippingAddress as CheckoutAddress,
        selectedShippingQuoteId: input.selectedShippingQuoteId,
      })
    : null

  const allowFallbacks = allowCheckoutFallbackDefaults()
  const pricingOptions = {
    discount: discount
      ? {
          ...discount,
          minimumOrderCents: discount.minimumOrderCents,
        }
      : null,
    shippingAddress,
    storeCountry: store?.country,
    currency,
    ...(requiresShipping && allowFallbacks
      ? {
          shippingRates: {
            domesticCents: Number(store?.shippingDomesticRateCents ?? 999),
            internationalCents: Number(store?.shippingInternationalRateCents ?? 1999),
          },
        }
      : !requiresShipping
        ? { shippingRates: null }
      : {}),
    shippingZones: requiresShipping
      ? store?.shippingZones?.map((zone) => ({
      id: zone.id,
      name: zone.name,
      countryCode: zone.countryCode,
      provinceCode: zone.provinceCode,
      isActive: zone.isActive,
      priority: zone.priority,
      rates: zone.rates.map((rate) => ({
        id: rate.id,
        name: rate.name,
        method: rate.method,
        amountCents: rate.amountCents,
        minSubtotalCents: rate.minSubtotalCents,
        maxSubtotalCents: rate.maxSubtotalCents,
        isActive: rate.isActive,
        priority: rate.priority,
      })),
    }))
      : [],
    taxRules: store?.taxRules?.map((rule) => ({
      id: rule.id,
      name: rule.name,
      countryCode: rule.countryCode,
      provinceCode: rule.provinceCode,
      rate: rule.rate,
      isActive: rule.isActive,
      priority: rule.priority,
    })),
    taxSettings: {
      enabled: store?.taxEnabled,
      strategy: store?.taxStrategy,
      defaultTaxRateBps: store?.defaultTaxRateBps,
      taxShipping: store?.taxShipping,
      pricesIncludeTax: store?.pricesIncludeTax,
    },
    ...(allowFallbacks && store?.country
      ? {
          taxRates: {
            domestic: Number(store?.domesticTaxRate ?? 0.07),
            international: Number(store?.internationalTaxRate ?? 0),
          },
        }
      : {}),
  }
  const pricing = buildCheckoutPricingWithDecisionsCents(
    lineItems,
    store?.shippingThresholdCents,
    {
      ...pricingOptions,
      additionalSubtotalDiscountCents: promotionDiscountAmountCents,
    }
  )
  const selectedShippingRate = requiresShipping
    ? mapShippingQuoteForSnapshot((shippingResolution as { selectedQuote: ShippingRateQuote }).selectedQuote)
    : buildDigitalNoShippingSnapshot(currency)
  const pricingWithSelectedShipping = requiresShipping
    ? buildCheckoutPricingWithDecisionsCents(lineItems, store?.shippingThresholdCents, {
        ...pricingOptions,
        additionalSubtotalDiscountCents: promotionDiscountAmountCents,
        selectedShippingAmountCents: selectedShippingRate.amountCents,
        selectedShippingRateId: selectedShippingRate.id,
      })
    : pricing
  const shippingAmountCents = pricingWithSelectedShipping.shippingAmountCents
  const discountAmountCents = pricingWithSelectedShipping.discountAmountCents ?? 0
  const codeDiscountAmountCents = pricingWithSelectedShipping.codeDiscountAmountCents ?? 0
  const resolvedPromotionDiscountAmountCents =
    pricingWithSelectedShipping.promotionDiscountAmountCents ?? promotionDiscountAmountCents
  const taxAmountCents = pricingWithSelectedShipping.taxAmountCents ?? 0
  const totalCents = pricingWithSelectedShipping.totalCents
  const appliedDiscount = pricingWithSelectedShipping.appliedDiscount
    ? {
        ...pricingWithSelectedShipping.appliedDiscount,
        amountCents: codeDiscountAmountCents,
      }
    : null
  const discountApplicationsForResponse = appliedDiscount
    ? [
        {
          ...appliedDiscount,
          amount: centsToDollars(codeDiscountAmountCents),
          amountCents: codeDiscountAmountCents,
        },
      ]
    : []

  const customer = await getCustomerByEmail(normalizedEmail)
  const stripeRuntime = await getStripeRuntimeConnection()
  if (!stripeRuntime.secretKey) {
    throw new Error(
      'Stripe checkout is not configured. Save and verify Stripe credentials in Settings -> Payments or set STRIPE_SECRET_KEY.'
    )
  }

  console.info(
    `[checkout] Stripe runtime source: ${stripeRuntime.source}; mode: ${stripeRuntime.mode ?? 'unknown'}`
  )

  let paymentIntent: StripePaymentIntent
  try {
    paymentIntent = await createStripePaymentIntent({
      amount: totalCents,
      currency,
      email: normalizedEmail,
      metadata: {
        checkoutEmail: normalizedEmail,
      },
      secretKey: stripeRuntime.secretKey,
    })
  } catch (stripeError) {
    const msg = stripeError instanceof Error ? stripeError.message : String(stripeError)
    if (msg.toLowerCase().includes('invalid api key') || msg.toLowerCase().includes('no such api key')) {
      throw new Error(
        `Stripe rejected the API key (source: ${stripeRuntime.source}, mode: ${stripeRuntime.mode ?? 'unknown'}). ` +
        'Verify the secret key in Settings → Payments and re-save to update.'
      )
    }
    throw stripeError
  }

  if (!paymentIntent.client_secret) {
    throw new Error('Stripe did not return a client secret for this payment intent')
  }

  const payload: CheckoutPayload = {
    email: normalizedEmail,
    items: lineItems.map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      variantTitle: item.variantTitle,
      sku: item.sku,
      priceCents: item.priceCents,
      quantity: item.quantity,
      fulfillmentType: normalizeCartFulfillmentType(item.fulfillmentType),
    })),
    ...(shippingAddress ? { shippingAddress } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    pricingSnapshot: {
      computedAt: new Date().toISOString(),
      currency,
      subtotalCents: pricingWithSelectedShipping.subtotalCents ?? 0,
      shippingAmountCents,
      taxAmountCents,
      discountAmountCents,
      codeDiscountAmountCents,
      promotionDiscountAmountCents: resolvedPromotionDiscountAmountCents,
      totalCents,
      shippingDecision: requiresShipping
        ? pricingWithSelectedShipping.shippingDecision
        : {
            ...pricingWithSelectedShipping.shippingDecision,
            warning: 'No shipping required for digital-only checkout.',
          },
      taxDecision: pricingWithSelectedShipping.taxDecision,
      ...(promotionApplications.length ? { promotionApplications } : {}),
    },
    selectedShippingRate,
    ...(appliedDiscount ? { discountApplications: [appliedDiscount] } : {}),
    ...(promotionApplications.length ? { promotionApplications } : {}),
  }

  const checkoutSession = await prisma.checkoutSession.create({
    data: {
      paymentIntentId: paymentIntent.id,
      customerId: customer?.id,
      email: normalizedEmail,
      currency,
      subtotalCents: pricingWithSelectedShipping.subtotalCents ?? 0,
      taxAmountCents,
      shippingAmountCents,
      discountAmountCents,
      totalCents,
      payload: payload as Prisma.InputJsonValue,
    },
  })

  await emitInternalEvent('checkout.created', {
    checkoutSessionId: checkoutSession.id,
    paymentIntentId: paymentIntent.id,
    email: normalizedEmail,
    total: centsToDollars(totalCents),
    currency,
  })

  return {
    checkoutSessionId: checkoutSession.id,
    paymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    currency,
    ...mapCheckoutPricingForPresentation(pricingWithSelectedShipping),
    shippingAmountCents,
    discountAmountCents,
    codeDiscountAmountCents,
    promotionDiscountAmountCents: resolvedPromotionDiscountAmountCents,
    totalCents,
    ...(promotionApplications.length ? { promotionApplications } : {}),
    shippingAmount: centsToDollars(shippingAmountCents),
    discountAmount: centsToDollars(discountAmountCents),
    codeDiscountAmount: centsToDollars(codeDiscountAmountCents),
    promotionDiscountAmount: centsToDollars(resolvedPromotionDiscountAmountCents),
    total: centsToDollars(totalCents),
    availableShippingRates: requiresShipping
      ? (shippingResolution as { quotes: ShippingRateQuote[] }).quotes.map(mapShippingQuoteForSnapshot)
      : [selectedShippingRate],
    selectedShippingRate,
    ...(discountApplicationsForResponse.length
      ? {
          discountApplications: discountApplicationsForResponse,
        }
      : {}),
    items: payload.items.map((item) => ({
      ...item,
      price: centsToDollars(item.priceCents ?? 0),
    })),
    appliedDiscount: appliedDiscount
      ? {
        ...appliedDiscount,
          amount: centsToDollars(
            appliedDiscount.amountCents ??
              dollarsToCents((appliedDiscount as { amount?: number }).amount ?? 0)
          ),
        }
      : undefined,
  }
}

export async function getCheckoutShippingRates(input: {
  items: CheckoutItemInput[]
  shippingAddress: CheckoutAddress
}) {
  const store = await getStoreSettings()
  const lineItems = await resolveLineItems(input.items)
  const shippingAddress = normalizeAddress(input.shippingAddress)
  const cartFingerprint = buildCheckoutCartFingerprint(
    lineItems.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      priceCents: item.priceCents,
    }))
  )
  const addressFingerprint = buildCheckoutAddressFingerprint(shippingAddress)
  const totalWeightOz = lineItems.reduce(
    (sum, item) => sum + Number((item as { weightOz?: number }).weightOz || 0) * Number(item.quantity || 0),
    0
  )

  const quotes = await getShippingRatesForCheckout({
    storeId: store?.id,
    subtotalCents: subtotalFromLineItems(lineItems),
    totalWeightOz,
    shippingAddress: toShippingRateAddress(shippingAddress),
  })

  return {
    currency: (store?.currency || 'USD').toUpperCase(),
    quotes: quotes.map((quote) => {
      const normalizedQuote = normalizeShippingQuoteForSelection({
        quote,
        cartFingerprint,
        addressFingerprint,
      })

      return {
        ...mapShippingQuoteForSnapshot(normalizedQuote),
        selectedShippingQuoteId: normalizedQuote.selectedShippingQuoteId,
        amount: centsToDollars(normalizedQuote.amountCents),
      }
    }),
  }
}

export async function completeCheckoutFromPaymentIntent(intent: StripePaymentIntent) {
  const existingOrder = await getOrderByPaymentIntentId(intent.id)
  if (existingOrder) {
    await prisma.checkoutSession.updateMany({
      where: { paymentIntentId: intent.id },
      data: { status: 'COMPLETED', completedAt: new Date(), failureReason: null },
    })
    await markCheckoutRecoveredByPaymentIntent(intent.id)
    await issueDigitalDownloadGrantsForPaidOrder({ orderId: existingOrder.id })
    return existingOrder
  }

  const checkoutSession = await prisma.checkoutSession.findUnique({
    where: { paymentIntentId: intent.id },
  })

  if (!checkoutSession) {
    throw new Error(`Checkout session not found for payment intent ${intent.id}`)
  }

  const payload = checkoutSession.payload as unknown as CheckoutPayload
  const customer = await resolveCheckoutCustomer(payload)
  const selectedShippingRate = payload.selectedShippingRate

  const order = await createOrder({
    customerId: customer?.id,
    email: payload.email,
    items: payload.items,
    shippingAddress: payload.shippingAddress,
    billingAddress: payload.billingAddress,
    discountApplications: payload.discountApplications,
    promotionApplications: payload.promotionApplications,
    taxAmountCents: checkoutSession.taxAmountCents,
    shippingAmountCents: checkoutSession.shippingAmountCents,
    shippingMethodName: selectedShippingRate?.displayName,
    shippingRateType:
      selectedShippingRate?.rateType ??
      (selectedShippingRate?.source === 'MANUAL' ? 'MANUAL' : selectedShippingRate?.source ?? null),
    shippingProvider:
      selectedShippingRate?.source && selectedShippingRate.source !== 'MANUAL'
        ? selectedShippingRate.source
        : null,
    shippingProviderRateId: selectedShippingRate?.providerRateId ?? null,
    estimatedDeliveryText:
      selectedShippingRate?.estimatedDeliveryText ??
      (Number.isFinite(selectedShippingRate?.estimatedDays)
        ? `${selectedShippingRate?.estimatedDays} business day${selectedShippingRate?.estimatedDays === 1 ? '' : 's'}`
        : null),
    discountAmountCents: checkoutSession.discountAmountCents,
    currency: checkoutSession.currency,
    stripePaymentIntentId: intent.id,
    stripeChargeId: getLatestChargeId(intent),
    paymentStatus: 'PAID',
  })

  await prisma.checkoutSession.update({
    where: { id: checkoutSession.id },
    data: {
      customerId: customer?.id,
      status: 'COMPLETED',
      completedAt: new Date(),
      failureReason: null,
    },
  })
  await markCheckoutRecoveredByPaymentIntent(intent.id)
  await issueDigitalDownloadGrantsForPaidOrder({ orderId: order.id })

  return order
}

export async function markCheckoutSessionFailed(input: {
  paymentIntentId: string
  reason?: string | null
}) {
  const existingOrder = await getOrderByPaymentIntentId(input.paymentIntentId)
  if (existingOrder) {
    return null
  }

  const checkoutSession = await prisma.checkoutSession.findUnique({
    where: { paymentIntentId: input.paymentIntentId },
  })

  if (!checkoutSession) {
    return null
  }

  const updateResult = await prisma.checkoutSession.updateMany({
    where: {
      id: checkoutSession.id,
      status: 'PENDING',
    },
    data: {
      status: 'FAILED',
      failureReason: input.reason ?? 'Payment failed',
    },
  })

  if (updateResult.count === 0) {
    return prisma.checkoutSession.findUnique({
      where: { id: checkoutSession.id },
    })
  }

  const updated = await prisma.checkoutSession.findUniqueOrThrow({
    where: { id: checkoutSession.id },
  })

  await emitInternalEvent('checkout.failed', {
    paymentIntentId: input.paymentIntentId,
    email: updated.email,
    reason: updated.failureReason,
  })

  return updated
}

export async function getCheckoutStatus(paymentIntentId: string): Promise<{
  status: 'processing' | 'paid' | 'failed'
  orderNumber?: number
  total?: number
  currency?: string
  estimatedDeliveryText?: string | null
  digitalDownloads?: Array<{
    fileName: string
    title: string
    downloadUrl: string
    expiresAt: string
    downloadLimit: number
    downloadCount: number
  }>
  digitalDownloadsPending?: boolean
  reason?: string | null
  checkoutStatus?: CheckoutSessionStatus
}> {
  const existingOrder = await getOrderByPaymentIntentId(paymentIntentId)
  if (existingOrder) {
    const digitalDownloads = await getBuyerDigitalDownloadAvailabilityForPaidOrder({
      orderId: existingOrder.id,
    })

    return {
      status: 'paid',
      orderNumber: existingOrder.orderNumber,
      total: centsToDollars(existingOrder.totalCents),
      currency: existingOrder.currency,
      estimatedDeliveryText: existingOrder.estimatedDeliveryText,
      ...(digitalDownloads.hasDigitalItems
        ? {
            digitalDownloads: digitalDownloads.downloads.map((entry) => ({
              ...entry,
              expiresAt: entry.expiresAt.toISOString(),
            })),
            digitalDownloadsPending: digitalDownloads.pending,
          }
        : {}),
      checkoutStatus: 'COMPLETED',
    }
  }

  const checkoutSession = await prisma.checkoutSession.findUnique({
    where: { paymentIntentId },
    select: {
      status: true,
      failureReason: true,
    },
  })

  if (!checkoutSession) {
    return { status: 'processing' }
  }

  if (checkoutSession.status === 'FAILED') {
    return {
      status: 'failed',
      reason: checkoutSession.failureReason,
      checkoutStatus: checkoutSession.status,
    }
  }

  return {
    status: 'processing',
    checkoutStatus: checkoutSession.status,
  }
}
