import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import PromotionVariantCommandPicker from './PromotionVariantCommandPicker'
import PromotionVariantSelectionList from './PromotionVariantSelectionList'

function renderPicker(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PromotionVariantCommandPicker
      addButtonLabel="Add selected"
      browseButtonLabel="Browse products"
      catalogEligibleCount={1}
      catalogError=""
      catalogLoading={false}
      catalogProductDetailsById={{
        prod_1: {
          id: 'prod_1',
          title: 'Never Nothing',
          handle: 'never-nothing',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [{ id: 'var_1', title: 'Black / Large', sku: 'NN-BLK' }],
        },
      }}
      catalogQuery=""
      catalogRows={[
        {
          id: 'prod_1',
          title: 'Never Nothing',
          handle: 'never-nothing',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [{ id: 'var_1', title: 'Black / Large', sku: 'NN-BLK' }],
        },
      ]}
      catalogTotalCount={1}
      emptyText="Search to find physical products and choose variants."
      onAddSelected={vi.fn()}
      onBrowse={vi.fn()}
      onCancel={vi.fn()}
      onOpenChange={vi.fn()}
      onSearch={vi.fn()}
      onTogglePendingVariant={vi.fn()}
      open
      pendingSelections={[]}
      pickerTitle="Browse products"
      searchPlaceholder="Search products..."
      section="qualifiers"
      selectedRows={[]}
      setCatalogQuery={vi.fn()}
      {...overrides}
    />
  )
}

describe('PromotionVariantCommandPicker', () => {
  it('renders product results and variant checkbox rows', () => {
    const html = renderPicker()

    expect(html).toContain('Never Nothing')
    expect(html).toContain('/never-nothing')
    expect(html).toContain('Black / Large')
    expect(html).toContain('SKU NN-BLK')
    expect(html).toContain('type="checkbox"')
  })

  it('shows the loading state without clearing existing rows', () => {
    const html = renderPicker({ catalogLoading: true })

    expect(html).toContain('Loading products...')
    expect(html).toContain('Never Nothing')
  })

  it('shows an empty variants message when a product has no variants', () => {
    const html = renderPicker({
      catalogProductDetailsById: {
        prod_1: {
          id: 'prod_1',
          title: 'Never Nothing',
          handle: 'never-nothing',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [],
        },
      },
      catalogRows: [
        {
          id: 'prod_1',
          title: 'Never Nothing',
          handle: 'never-nothing',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [],
        },
      ],
    })

    expect(html).toContain('No variants available for this product.')
  })

  it('shows a loading variants hint until product detail arrives', () => {
    const html = renderPicker({
      catalogProductDetailsById: {},
    })

    expect(html).toContain('Loading variants...')
  })

  it('shows the eligible-physical empty message when products are filtered out', () => {
    const html = renderPicker({
      catalogRows: [],
      catalogTotalCount: 2,
      catalogEligibleCount: 0,
    })

    expect(html).toContain('No eligible physical products found. Only active physical products can be used in Smart Promotions V1.')
  })

  it('shows the search empty message when no products match', () => {
    const html = renderPicker({
      catalogRows: [],
      catalogTotalCount: 0,
      catalogEligibleCount: 0,
      catalogQuery: 'yo',
    })

    expect(html).toContain('No products found for this search.')
  })

  it('shows API errors without leaving the loading copy behind', () => {
    const html = renderPicker({
      catalogRows: [],
      catalogError: 'Failed to load products. Try again.',
    })

    expect(html).toContain('Failed to load products. Try again.')
  })

  it('marks already selected variants and keeps add disabled without pending selections', () => {
    const html = renderPicker({
      selectedRows: [
        {
          variantId: 'var_1',
          productTitle: 'Never Nothing',
          variantTitle: 'Black / Large',
          sku: 'NN-BLK',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    })

    expect(html).toContain('Already selected')
    expect(html).toContain('disabled=""')
  })

  it('marks pending rows as active so the whole row has a visible selected state', () => {
    const html = renderPicker({
      pendingSelections: [
        {
          productId: 'prod_1',
          productTitle: 'Never Nothing',
          variantId: 'var_1',
          variantTitle: 'Black / Large',
          sku: 'NN-BLK',
          fulfillmentType: 'PHYSICAL',
        },
      ],
    })

    expect(html).toContain('promotion-command-picker__variant-row is-active')
    expect(html).toContain('data-selected="true"')
    expect(html).toContain('Ready to add')
    expect(html).toContain('Add selected (1)')
  })

  it('keeps the entire variant row wrapped in a label so clicks are not limited to the checkbox', () => {
    const html = renderPicker()

    expect(html).toContain('<label')
    expect(html).toContain('promotion-command-picker__variant-row')
    expect(html).toContain('type="checkbox"')
  })
})

function renderSelectionList(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    <PromotionVariantSelectionList
      browseButtonLabel="Browse products"
      emptyHelper="Choose the products customers must have in cart."
      emptyTitle="No required items selected."
      onBrowse={vi.fn()}
      onChangeQuantity={vi.fn()}
      onRemove={vi.fn()}
      quantityLabel="Required quantity"
      rows={[]}
      title="Selected required items"
      {...overrides}
    />
  )
}

describe('PromotionVariantSelectionList', () => {
  it('renders the required-items empty state copy', () => {
    const html = renderSelectionList()

    expect(html).toContain('Selected required items')
    expect(html).toContain('No required items selected.')
    expect(html).toContain('Choose the products customers must have in cart.')
    expect(html).toContain('Browse products')
  })

  it('renders a selected required item immediately after add selected', () => {
    const html = renderSelectionList({
      rows: [
        {
          variantId: 'var_1',
          productTitle: 'Never Nothing',
          variantTitle: 'Black / Large',
          sku: 'NN-BLK',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      validationMessage: '',
    })

    expect(html).toContain('Never Nothing')
    expect(html).toContain('Black / Large')
    expect(html).toContain('SKU NN-BLK')
    expect(html).toContain('value="1"')
    expect(html).toContain('Change')
  })

  it('renders a selected reward item immediately after add selected', () => {
    const html = renderSelectionList({
      browseButtonLabel: 'Browse rewards',
      emptyHelper: 'Choose what receives the discount.',
      emptyTitle: 'No reward items selected.',
      quantityLabel: 'Reward quantity',
      rows: [
        {
          variantId: 'var_reward',
          productTitle: 'Sticker Pack',
          variantTitle: 'Default',
          sku: 'ST-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      title: 'Selected reward items',
      validationMessage: '',
    })

    expect(html).toContain('Selected reward items')
    expect(html).toContain('Sticker Pack')
    expect(html).toContain('Reward quantity')
    expect(html).toContain('Change')
  })

  it('renders inline validation copy for required rows when save is still blocked', () => {
    const html = renderSelectionList({
      validationMessage: 'Add at least one required cart item.',
    })

    expect(html).toContain('Add at least one required cart item.')
  })
})
