import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('Discounts and promotions workspace copy', () => {
  it('keeps discount codes and automatic promotions tabs visible in the workspace', () => {
    const file = read('src/components/discounts/DiscountsWorkspace.js')
    expect(file).toContain('Discount codes')
    expect(file).toContain('Automatic promotions')
    expect(file).toContain('Create discount code')
  })

  it('includes promotions list loading and empty-state copy', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('isLoading={loading}')
    expect(file).toContain('No automatic promotions yet.')
    expect(file).toContain('Create product group discounts, Buy X Get Y offers, or free gift promotions.')
  })

  it('includes create drawer workflow and type-specific V1 guidance copy', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('Create automatic promotion')
    expect(file).toContain('Reward product rows are not supported for product group discounts in Smart Promotions V1.')
    expect(file).toContain("'Discount settings'")
    expect(file).toContain('Reward items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.')
    expect(file).toContain('The free gift must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.')
  })

  it('uses soft-disable language and DELETE behavior for disabling promotions', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('Disable this promotion? It will stop applying at checkout, but past orders will keep their promotion history.')
    expect(file).toContain("fetch(`/api/promotions/${promotionId}`, { method: 'DELETE' })")
    expect(file).toContain('Disable')
  })

  it('shows validation errors and V1 stacking note in summary', () => {
    const file = read('src/components/discounts/AutomaticPromotionsWorkspace.js')
    expect(file).toContain('extractPromotionValidationIssues')
    expect(file).toContain('canSubmitPromotionDraft')
    expect(file).toContain('Smart Promotions do not combine with discount codes in V1.')
    expect(file).toContain('validationIssues.map')
  })
})
