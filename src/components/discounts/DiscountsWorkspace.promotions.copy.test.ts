import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Promotions workspace copy', () => {
  it('uses unified promotions language with a single primary create action', () => {
    const file = read('src/components/discounts/DiscountsWorkspace.js')
    expect(file).toContain('title="Promotions"')
    expect(file).toContain('Create and manage discount codes and automatic offers.')
    expect(file).toContain('Create promotion')
    expect(file).toContain("BROWSE_FILTERS = [")
    expect(file).toContain("label: 'All'")
    expect(file).toContain("label: 'Discount codes'")
    expect(file).toContain("label: 'Automatic'")
  })

  it('starts creation with a type-selection screen and all required offer cards', () => {
    const file = read('src/components/discounts/DiscountsWorkspace.js')
    expect(file).toContain('Choose how this offer should work.')
    expect(file).toContain("title: 'Amount off products'")
    expect(file).toContain("title: 'Amount off order'")
    expect(file).toContain("title: 'Free shipping'")
    expect(file).toContain("title: 'Product group discount'")
    expect(file).toContain("title: 'Buy X Get Y'")
    expect(file).toContain("title: 'Free gift'")
    expect(file).toContain('disabled={!selectedOfferDefinition}')
  })

  it('keeps the legacy discount-code builder focused on supported methods only', () => {
    const workspace = read('src/components/discounts/DiscountsWorkspace.js')
    const data = read('src/lib/discountsData.js')
    expect(workspace).toContain("LEGACY_DISCOUNT_METHODS = ['amount off products', 'amount off order', 'free shipping']")
    expect(workspace).toContain('Looking for Buy X Get Y, Free Gift, or product group savings? Use an automatic promotion type.')
    expect(data).toContain("DISCOUNT_METHODS = ['amount off products', 'amount off order', 'free shipping']")
    expect(data).not.toContain("DISCOUNT_METHODS = ['amount off products', 'amount off order', 'buy x get y', 'free shipping']")
  })

  it('keeps automatic promotion listing copy intact under the unified promotions area', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('No automatic promotions yet.')
    expect(file).toContain('Create product group discounts, Buy X Get Y offers, or free gift promotions.')
    expect(file).toContain("header: 'Method'")
    expect(file).toContain("render: () => 'Automatic'")
  })

  it('uses smart promotion details and schedule sections instead of tabbed wizard steps', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('eyebrow="Offer details"')
    expect(file).toContain('eyebrow="Customer must buy"')
    expect(file).toContain('eyebrow="Schedule & publish"')
    expect(file).toContain('title="Preview"')
    expect(file).not.toContain('tabs={[')
    expect(file).toContain('Product group discounts apply to the selected qualifier products only in V1.')
    expect(file).toContain('Reward items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.')
    expect(file).toContain('Gift items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.')
  })

  it('keeps selectable card styling for both create type cards and automatic promotion type cards', () => {
    const workspace = read('src/components/discounts/DiscountsWorkspace.module.css')
    const automatic = read('src/components/discounts/AutomaticPromotionsWorkspace.module.css')
    expect(workspace).toContain('.offerChoiceCard:hover')
    expect(workspace).toContain('.offerChoiceCardActive')
    expect(workspace).toContain('.offerChoiceBadge')
    expect(workspace).toContain('.offerChoiceRadio')
    expect(automatic).toContain('.typeCard:hover')
    expect(automatic).toContain('.typeCardActive')
    expect(automatic).toContain('.typeCardBadge')
    expect(automatic).toContain('.typeCardDot')
  })

  it('preserves disable behavior and validation/preview support for smart promotions', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('Disable this promotion? It will stop applying at checkout, but past orders will keep their promotion history.')
    expect(file).toContain("fetch(`/api/promotions/${promotionId}`, { method: 'DELETE' })")
    expect(file).toContain('extractPromotionValidationIssues')
    expect(file).toContain('canSubmitPromotionDraft')
    expect(file).toContain('Smart Promotions do not combine with discount codes in V1.')
  })
})
