import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const PAGE = 'src/app/(storefront)/checkout/CheckoutClientPage.tsx'

describe('checkout button copy and state', () => {
  it('uses "Review payment" as the idle CTA before payment intent is created', () => {
    const source = read(PAGE)
    expect(source).toContain("'Review payment'")
  })

  it('uses "Loading payment form..." as the loading label while creating payment intent', () => {
    const source = read(PAGE)
    expect(source).toContain("'Loading payment form...'")
    // Must not use the ambiguous old label
    expect(source).not.toContain("'Loading payment...'")
  })

  it('uses "Place order" as the CTA after the payment element is mounted', () => {
    const source = read(PAGE)
    expect(source).toContain("'Place order'")
  })

  it('uses "Placing order..." as the loading label during payment confirmation', () => {
    const source = read(PAGE)
    expect(source).toContain("'Placing order...'")
  })

  it('uses explicit empty-cart recovery copy and a prominent return CTA', () => {
    const source = read(PAGE)
    expect(source).toContain('Your cart is empty.')
    expect(source).toContain('Add at least one item to continue through secure checkout.')
    expect(source).toContain('Return to shop')
    expect(source).toContain('className="empty-cta"')
  })

  it('uses "Edit details" to let the customer return from payment step to address step', () => {
    const source = read(PAGE)
    expect(source).toContain('Edit details')
    expect(source).toContain('resetPaymentStep()')
  })

  it('labels errors "Could not start checkout" before payment intent creation', () => {
    const source = read(PAGE)
    expect(source).toContain("'Could not start checkout'")
  })

  it('labels errors "Payment failed" during payment confirmation', () => {
    const source = read(PAGE)
    // paymentReady ? 'Payment failed' : 'Could not start checkout'
    expect(source).toContain("paymentReady ? 'Payment failed'")
    expect(source).toContain("'Could not start checkout'")
  })

  it('guards "Review payment" / "Place order" button with disabled when required fields are missing', () => {
    const source = read(PAGE)
    // Disabled when any blocker reason exists (address, shipping method, loading, checkout init failure)
    expect(source).toContain('disabled={Boolean(reviewPaymentDisabledReason)}')
    // Disabled during payment confirmation
    expect(source).toContain('disabled={confirmingPayment}')
  })

  it('does not apply primaryStyle inline when the button is disabled', () => {
    const source = read(PAGE)
    // When disabled, only brandButtonBaseStyle is applied (no primaryStyle that carries color: #080808)
    expect(source).toContain("reviewButtonState !== 'ready'")
    expect(source).toContain('? brandButtonBaseStyle')
    expect(source).toContain(': { ...brandButtonBaseStyle, ...CHECKOUT_BUTTON_READY_STYLE }')
    // primaryStyle must NOT be spread unconditionally onto a button that can be disabled
    const lines = source.split('\n')
    const primaryBtnLines = lines.filter(
      (line) => line.includes('primary-btn') && line.includes('disabled') && line.includes('primaryStyle')
    )
    expect(primaryBtnLines).toHaveLength(0)
  })

  it('uses !important on disabled CSS to guard against accent-color inline style leakage', () => {
    const source = read(PAGE)
    expect(source).toContain('.primary-btn:disabled{')
    expect(source).toContain('color:color-mix(in srgb, var(--checkout-text) 72%, transparent)!important')
    expect(source).toContain('background:color-mix(in srgb, var(--checkout-button-bg) 10%, transparent)!important')
  })

  it('defines explicit primary button states for ready, disabled, loading, and error-blocked', () => {
    const source = read(PAGE)
    expect(source).toContain("data-state={reviewButtonState}")
    expect(source).toContain(".primary-btn[data-state='ready']")
    expect(source).toContain(".primary-btn[data-state='loading']")
    expect(source).toContain(".primary-btn[data-state='error-blocked']")
  })

  it('renders disabled helper text for address, shipping, payment readiness, and initialization failures', () => {
    const source = read(PAGE)
    expect(source).toContain('Enter a valid shipping and billing address before continuing.')
    expect(source).toContain('Select a shipping method before continuing.')
    expect(source).toContain('Mixed physical and digital carts are not supported yet.')
    expect(source).toContain('Payment form is still loading. Please wait a moment.')
    expect(source).toContain('Checkout initialization failed. Fix the error above and try again.')
  })

  it('includes digital-only no-shipping checkout copy', () => {
    const source = read(PAGE)
    expect(source).toContain('No shipping required. Digital delivery will be available after payment.')
    expect(source).toContain('Blocked for mixed cart')
  })

  it('keeps checkout button styling frontend-owned and independent of Brand Kit theme fields', () => {
    const source = read(PAGE)
    expect(source).toContain('CHECKOUT_BUTTON_READY_STYLE')
    expect(source).toContain("background: 'var(--checkout-button-bg)'")
    expect(source).toContain("color: 'var(--checkout-button-text)'")
    expect(source).not.toContain('accentColor')
    expect(source).not.toContain('primaryColor')
    expect(source).not.toContain('buttonStyle')
    expect(source).not.toContain('buttonTextTransform')
    expect(source).not.toContain('buttonRadius')
  })

  it('locks Stripe Payment Element appearance to beta-safe readable values', () => {
    const source = read(PAGE)
    expect(source).toContain('STRIPE_BETA_APPEARANCE')
    expect(source).toContain("colorPrimary: '#9fb4ff'")
    expect(source).toContain("colorText: '#f8f8fb'")
    expect(source).toContain("colorTextSecondary: '#b5bcc9'")
    expect(source).toContain("colorTextPlaceholder: '#949db0'")
    expect(source).toContain("colorInputBackground: '#0f1117'")
    expect(source).toContain("'.Tab--selected'")
  })

  it('uses "Loading shipping options..." during the shipping rate fetch', () => {
    const source = read(PAGE)
    expect(source).toContain("'Loading shipping options...'")
  })

  it('keeps payment section labels and card form colors readable on dark backgrounds', () => {
    const source = read(PAGE)
    expect(source).toContain("colorTextSecondary: '#b5bcc9'")
    expect(source).toContain("'.Label'")
    expect(source).toContain("color: '#f2f4f8'")
    expect(source).toContain('.section-title{font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:var(--checkout-muted);margin-bottom:16px}')
    expect(source).toContain('.payment-shell{margin-top:24px;padding:20px;border-radius:22px;border:1px solid var(--checkout-border);background:color-mix(in srgb, var(--checkout-surface-strong) 88%, #ffffff 12%)}')
  })

  it('lets customers edit cart quantities directly from checkout summary', () => {
    const source = read(PAGE)
    expect(source).toContain('handleOrderQuantityChange')
    expect(source).toContain('handleOrderItemRemove')
    expect(source).toContain('Decrease quantity for ${item.title}')
    expect(source).toContain('Increase quantity for ${item.title}')
    expect(source).toContain('Remove')
  })

  it('does not create an order from the browser redirect', () => {
    const source = read(PAGE)
    // The only navigation on success is a router.push to /checkout/success
    // No order creation call (createOrder, POST /api/orders) is made from the client
    expect(source).not.toContain('createOrder')
    expect(source).not.toContain('/api/orders')
    expect(source).toContain("router.push(`/checkout/success")
  })

  it('creates checkout state first and mounts payment element in a follow-up effect', () => {
    const source = read(PAGE)
    expect(source).toContain('setCheckout(payload.data)')
    expect(source).not.toContain('initializePaymentElement(payload.data.clientSecret)')
    expect(source).toContain('useEffect(() => {')
    expect(source).toContain("const clientSecret = checkout?.clientSecret")
    expect(source).toContain("if (!document.getElementById('payment-element'))")
  })

  it('guards against duplicate payment-element mounts for the same client secret', () => {
    const source = read(PAGE)
    expect(source).toContain('mountedClientSecretRef')
    expect(source).toContain('if (mountedClientSecretRef.current === clientSecretToMount && paymentElementRef.current) return')
  })

  it('unmounts stale payment element state when checkout is reset', () => {
    const source = read(PAGE)
    expect(source).toContain('paymentElementRef.current.unmount()')
    expect(source).toContain('mountedClientSecretRef.current = null')
    expect(source).toContain('setCheckout(null)')
    expect(source).toContain('setPaymentReady(false)')
  })
})
