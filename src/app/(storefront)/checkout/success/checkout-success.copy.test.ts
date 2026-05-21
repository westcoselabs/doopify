import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

const PAGE = 'src/app/(storefront)/checkout/success/CheckoutSuccessClientPage.tsx'

describe('checkout success waiting-state copy', () => {
  it('renders customer-friendly processing copy with loading and no internal terminology', () => {
    const source = read(PAGE)
    expect(source).toContain('Confirming your order…')
    expect(source).toContain('We&apos;re confirming your payment and preparing your order. This usually only takes a few seconds.')
    expect(source).toContain('Please don&apos;t close or refresh this page.')
    expect(source).toContain('className="spinner"')
    expect(source).not.toContain('webhook')
    expect(source).not.toContain('order record')
    expect(source).not.toContain('payment intent')
    expect(source).not.toContain('polling')
  })

  it('renders processing, success, pending, and failure state copy', () => {
    const source = read(PAGE)
    expect(source).toContain('Thank you for your order')
    expect(source).toContain('Your payment was successful and your order has been received.')
    expect(source).toContain('Order #')
    expect(source).toContain('We&apos;re still processing your order')
    expect(source).toContain("Payment received. We're still finalizing your order.")
    expect(source).toContain("We couldn't confirm your order status due to a network issue.")
    expect(source).toContain('If this takes more than a minute, contact support with your payment reference')
    expect(source).toContain('Payment could not be completed')
    expect(source).toContain('Please return to checkout and try another payment method.')
  })

  it('includes support contact and pending actions', () => {
    const source = read(PAGE)
    expect(source).toContain('Questions? Contact')
    expect(source).toContain('Contact the store for help with your order.')
    expect(source).toContain('supportEmail')
    expect(source).toContain('supportPhone')
    expect(source).toContain('supportPhoneHref')
    expect(source).toContain('mailto:${support.supportEmail}')
    expect(source).toContain('href={support.supportPhoneHref}')
    expect(source).toContain('Check again')
    expect(source).toContain('Continue shopping')
    expect(source).toContain('Contact support')
  })

  it('uses frontend-owned checkout CTA tokens instead of Brand Kit theme controls', () => {
    const source = read(PAGE)
    expect(source).toContain('CHECKOUT_RESULT_PRIMARY_ACTION_STYLE')
    expect(source).toContain("background: 'var(--checkout-button-bg)'")
    expect(source).toContain("color: 'var(--checkout-button-text)'")
    expect(source).toContain('style={primaryActionStyle}')
  })
})
