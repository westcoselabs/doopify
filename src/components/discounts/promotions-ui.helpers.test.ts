import { describe, expect, it, vi } from 'vitest'

import {
  beginPromotionCatalogSearch,
  buildPromotionCatalogListUrl,
  buildPromotionCatalogSearchUrl,
  buildPromotionListQuery,
  buildPromotionPayloadFromDraft,
  buildPromotionPreview,
  canSubmitPromotionDraft,
  closePromotionCatalogState,
  createPromotionCatalogState,
  createPromotionDraft,
  extractPromotionValidationIssues,
  fetchPromotionCatalogProducts,
  formatRewardSummary,
  openPromotionCatalogSection,
  normalizePromotionDraftForType,
  resolvePromotionCatalogSearchError,
  resolvePromotionCatalogSearchSuccess,
  shouldFetchPromotionCatalog,
  shouldLoadPromotionCatalogOnOpen,
  togglePromotionPendingSelection,
  updatePromotionCatalogQuery,
} from './promotions-ui.helpers'

describe('promotion catalog product loading', () => {
  it('builds the admin picker search URL', () => {
    expect(buildPromotionCatalogSearchUrl('yo')).toBe('/api/admin/products/search?query=yo&limit=25')
    expect(buildPromotionCatalogSearchUrl('   ')).toBe('/api/admin/products/search?limit=25')
  })

  it('builds the product list fallback URL', () => {
    expect(buildPromotionCatalogListUrl('yo')).toBe('/api/products?page=1&pageSize=25&status=ACTIVE&search=yo')
    expect(buildPromotionCatalogListUrl('   ')).toBe('/api/products?page=1&pageSize=25&status=ACTIVE')
  })

  it('uses the admin search payload when variants are already present', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('/api/admin/products/search?')) {
        return new Response(
          JSON.stringify({
            success: true,
            products: [
              {
                id: 'prod_1',
                title: 'Never Nothing',
                handle: 'never-nothing',
                status: 'ACTIVE',
                fulfillmentType: 'PHYSICAL',
                variants: [{ id: 'var_1', title: 'Black / Large', sku: 'NN-BLK' }],
              },
            ],
          }),
          { status: 200 }
        )
      }

      throw new Error(`Unexpected fetch: ${input}`)
    })

    const result = await fetchPromotionCatalogProducts('yo', fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/products/search?query=yo&limit=25')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.totalResultCount).toBe(1)
    expect(result.eligibleResultCount).toBe(1)
    expect(result.rows).toEqual([
      {
        id: 'prod_1',
        title: 'Never Nothing',
        handle: 'never-nothing',
        status: 'ACTIVE',
        fulfillmentType: 'PHYSICAL',
        variants: [{ id: 'var_1', title: 'Black / Large', sku: 'NN-BLK' }],
      },
    ])
  })

  it('filters non-physical products and reports eligible counts for empty-state messaging', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('/api/admin/products/search?')) {
        return new Response(
          JSON.stringify({
            success: true,
            products: [
              {
                id: 'prod_digital',
                title: 'Digital Pack',
                handle: 'digital-pack',
                status: 'ACTIVE',
                fulfillmentType: 'DIGITAL',
                variants: [{ id: 'var_digital', title: 'Download', sku: 'DIGI-1' }],
              },
            ],
          }),
          { status: 200 }
        )
      }

      throw new Error(`Unexpected fetch: ${input}`)
    })

    const result = await fetchPromotionCatalogProducts('', fetchMock as unknown as typeof fetch)

    expect(result.totalResultCount).toBe(1)
    expect(result.eligibleResultCount).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('hydrates from /api/products/[id] when the fallback list payload lacks variant titles', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('/api/admin/products/search?')) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'missing',
          }),
          { status: 404 }
        )
      }

      if (input.startsWith('/api/products?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              products: [
                {
                  id: 'prod_1',
                  title: 'Yo Momma',
                  handle: 'yo-momma',
                  status: 'ACTIVE',
                  fulfillmentType: 'PHYSICAL',
                  variants: [{ id: 'var_1', sku: 'YM-1' }],
                },
              ],
            },
          }),
          { status: 200 }
        )
      }

      if (input === '/api/products/prod_1') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: 'prod_1',
              title: 'Yo Momma',
              handle: 'yo-momma',
              status: 'ACTIVE',
              fulfillmentType: 'PHYSICAL',
              variants: [{ id: 'var_1', title: 'Default', sku: 'YM-1' }],
            },
          }),
          { status: 200 }
        )
      }

      throw new Error(`Unexpected fetch: ${input}`)
    })

    const result = await fetchPromotionCatalogProducts('', fetchMock as unknown as typeof fetch)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/products/search?limit=25')
    expect(fetchMock).toHaveBeenCalledWith('/api/products?page=1&pageSize=25&status=ACTIVE')
    expect(fetchMock).toHaveBeenCalledWith('/api/products/prod_1')
    expect(result.rows[0]?.variants).toEqual([{ id: 'var_1', title: 'Default', sku: 'YM-1' }])
  })

  it('falls back to summary rows when detail hydration fails', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input.startsWith('/api/admin/products/search?')) {
        return new Response(
          JSON.stringify({
            success: true,
            products: [
              {
                id: 'prod_1',
                title: 'Yo Momma',
                handle: 'yo-momma',
                status: 'ACTIVE',
                fulfillmentType: 'PHYSICAL',
                variants: [{ id: 'var_1', sku: 'YM-1' }],
              },
            ],
          }),
          { status: 200 }
        )
      }

      return new Response(JSON.stringify({ success: false, error: 'not found' }), { status: 404 })
    })

    const result = await fetchPromotionCatalogProducts('', fetchMock as unknown as typeof fetch)

    expect(result.rows[0]?.variants).toEqual([{ id: 'var_1', title: 'Default', sku: 'YM-1' }])
  })

  it('surfaces a useful error when the API fails', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'boom' }), { status: 500 }))

    await expect(fetchPromotionCatalogProducts('', fetchMock as unknown as typeof fetch)).rejects.toThrow(
      'boom'
    )
  })
})

describe('promotions UI helpers', () => {
  it('builds list query params with valid filters and search', () => {
    const query = buildPromotionListQuery({
      search: 'hoodie',
      status: 'ACTIVE',
      type: 'FREE_GIFT',
      page: 2,
      pageSize: 50,
    })

    expect(query).toContain('search=hoodie')
    expect(query).toContain('status=ACTIVE')
    expect(query).toContain('type=FREE_GIFT')
    expect(query).toContain('page=2')
    expect(query).toContain('pageSize=50')
  })

  it('does not include ALL filters in list query params', () => {
    const query = buildPromotionListQuery({
      search: '',
      status: 'ALL',
      type: 'ALL',
    })

    expect(query).not.toContain('status=')
    expect(query).not.toContain('type=')
    expect(query).toContain('page=1')
    expect(query).toContain('pageSize=20')
  })

  it('normalizes product group discounts to omit reward rows', () => {
    const draft = {
      ...createPromotionDraft('PRODUCT_GROUP_DISCOUNT'),
      rewards: [
        {
          variantId: 'var_reward',
          productTitle: 'Hat',
          variantTitle: 'Default',
          sku: 'HAT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const normalized = normalizePromotionDraftForType(draft)
    expect(normalized.rewards).toHaveLength(0)
  })

  it('forces free gift payload to FREE reward type and zero value', () => {
    const draft = {
      ...createPromotionDraft('FREE_GIFT'),
      rewardType: 'PERCENTAGE' as const,
      value: '50',
      name: 'Free sticker',
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Sticker',
          variantTitle: 'Pack',
          sku: 'ST-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const payload = buildPromotionPayloadFromDraft(draft)
    expect(payload.rewardType).toBe('FREE')
    expect(payload.value).toBe(0)
  })

  it('builds payload rows with required and reward quantities', () => {
    const draft = {
      ...createPromotionDraft('BUY_X_GET_Y'),
      name: 'Hoodie hat',
      value: '20',
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 2,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Hat',
          variantTitle: 'Blue',
          sku: 'HT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
    }

    const payload = buildPromotionPayloadFromDraft(draft)
    expect(payload.qualifiers).toEqual([{ variantId: 'var_q', requiredQuantity: 2 }])
    expect(payload.rewards).toEqual([{ variantId: 'var_r', rewardQuantity: 1 }])
  })

  it('formats reward summaries for percentage, fixed amount, and free gift', () => {
    expect(
      formatRewardSummary({
        type: 'BUY_X_GET_Y',
        rewardType: 'PERCENTAGE',
        value: 15,
      })
    ).toBe('15% off')
    expect(
      formatRewardSummary({
        type: 'BUY_X_GET_Y',
        rewardType: 'FIXED_AMOUNT',
        value: 5,
      })
    ).toBe('$5.00 off')
    expect(
      formatRewardSummary({
        type: 'FREE_GIFT',
        rewardType: 'FREE',
        value: 0,
      })
    ).toBe('Free reward items')
  })

  it('builds plain-English previews including V1 cart behavior wording', () => {
    const preview = buildPromotionPreview({
      ...createPromotionDraft('BUY_X_GET_Y'),
      qualifiers: [
        {
          variantId: 'var_q',
          productTitle: 'Hoodie',
          variantTitle: 'Black',
          sku: 'HD-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      rewards: [
        {
          variantId: 'var_r',
          productTitle: 'Hat',
          variantTitle: 'Blue',
          sku: 'HT-1',
          fulfillmentType: 'PHYSICAL',
          quantity: 1,
        },
      ],
      value: '50',
    })

    expect(preview).toContain('if those reward items are also in the cart')
  })

  it('extracts structured validation issues from service-style errors payload', () => {
    const issues = extractPromotionValidationIssues({
      errors: [{ path: 'qualifiers[0].variantId', code: 'UNKNOWN_VARIANT', message: 'Variant not found' }],
    })

    expect(issues).toEqual([
      {
        path: 'qualifiers[0].variantId',
        code: 'UNKNOWN_VARIANT',
        message: 'Variant not found',
      },
    ])
  })

  it('extracts field errors from zod-style payload shape', () => {
    const issues = extractPromotionValidationIssues({
      fieldErrors: {
        name: ['Name is required'],
        value: ['Expected number'],
      },
    })

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name', message: 'Name is required' }),
        expect.objectContaining({ path: 'value', message: 'Expected number' }),
      ])
    )
  })

  it('requires basic minimum fields before allowing submit', () => {
    const missingName = createPromotionDraft('PRODUCT_GROUP_DISCOUNT')
    missingName.qualifiers = [
      {
        variantId: 'var_q',
        productTitle: 'Hoodie',
        variantTitle: 'Black',
        sku: 'HD-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]
    missingName.value = '15'

    expect(canSubmitPromotionDraft(missingName)).toBe(false)

    const readyDraft = {
      ...missingName,
      name: 'Bundle savings',
    }

    expect(canSubmitPromotionDraft(readyDraft)).toBe(true)
  })

  it('requires reward rows for reward-based promotion types', () => {
    const buyX = createPromotionDraft('BUY_X_GET_Y')
    buyX.name = 'Buy hoodie get hat'
    buyX.value = '20'
    buyX.qualifiers = [
      {
        variantId: 'var_q',
        productTitle: 'Hoodie',
        variantTitle: 'Black',
        sku: 'HD-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]

    expect(canSubmitPromotionDraft(buyX)).toBe(false)

    buyX.rewards = [
      {
        variantId: 'var_r',
        productTitle: 'Hat',
        variantTitle: 'Blue',
        sku: 'HT-1',
        fulfillmentType: 'PHYSICAL',
        quantity: 1,
      },
    ]

    expect(canSubmitPromotionDraft(buyX)).toBe(true)
  })

  it('loads each picker section once on first open and keeps state isolated by section', () => {
    const initial = createPromotionCatalogState()

    expect(shouldLoadPromotionCatalogOnOpen(initial, 'qualifiers')).toBe(true)
    expect(shouldLoadPromotionCatalogOnOpen(initial, 'rewards')).toBe(true)

    const openedQualifiers = openPromotionCatalogSection(initial, 'qualifiers')
    const qualifierSearch = beginPromotionCatalogSearch(openedQualifiers, 'qualifiers')
    const loadedQualifiers = resolvePromotionCatalogSearchSuccess(
      qualifierSearch,
      'qualifiers',
      [
        {
          id: 'prod_1',
          title: 'Black Hoodie',
          handle: 'black-hoodie',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [{ id: 'var_1', title: 'Large', sku: 'HD-L' }],
        },
      ],
      qualifierSearch.sections.qualifiers.requestId,
      ''
    )

    expect(shouldLoadPromotionCatalogOnOpen(loadedQualifiers, 'qualifiers')).toBe(false)
    expect(shouldLoadPromotionCatalogOnOpen(loadedQualifiers, 'rewards')).toBe(true)
    expect(loadedQualifiers.sections.qualifiers.rows).toHaveLength(1)
    expect(loadedQualifiers.sections.rewards.rows).toHaveLength(0)
    expect(loadedQualifiers.sections.qualifiers.totalResultCount).toBe(1)
    expect(loadedQualifiers.sections.qualifiers.eligibleResultCount).toBe(1)
  })

  it('does not require repeated fetches when the query has not changed', () => {
    const initial = createPromotionCatalogState()
    const queried = updatePromotionCatalogQuery(initial, 'qualifiers', 'hoodie')
    const loading = beginPromotionCatalogSearch(queried, 'qualifiers')
    const loaded = resolvePromotionCatalogSearchSuccess(
      loading,
      'qualifiers',
      [],
      loading.sections.qualifiers.requestId,
      'hoodie'
    )

    expect(shouldFetchPromotionCatalog(loaded, 'qualifiers')).toBe(false)
    expect(shouldFetchPromotionCatalog(loaded, 'qualifiers', { force: true })).toBe(true)
  })

  it('updates search text without clearing prior results and ignores stale pending state across sections', () => {
    const initial = createPromotionCatalogState()
    const loading = beginPromotionCatalogSearch(initial, 'qualifiers')
    const loaded = resolvePromotionCatalogSearchSuccess(
      loading,
      'qualifiers',
      [
        {
          id: 'prod_1',
          title: 'Classic Hat',
          handle: 'classic-hat',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [{ id: 'var_1', title: 'Default', sku: 'HAT-DEFAULT' }],
        },
      ],
      loading.sections.qualifiers.requestId,
      ''
    )

    const queried = updatePromotionCatalogQuery(loaded, 'qualifiers', 'hat')
    expect(queried.sections.qualifiers.rows).toHaveLength(1)
    expect(queried.sections.qualifiers.query).toBe('hat')

    const toggled = togglePromotionPendingSelection(queried, 'qualifiers', {
      productId: 'prod_1',
      productTitle: 'Classic Hat',
      variantId: 'var_1',
      variantTitle: 'Default',
      sku: 'HAT-DEFAULT',
      fulfillmentType: 'PHYSICAL',
    })
    expect(toggled.sections.qualifiers.pendingSelections).toHaveLength(1)
    expect(toggled.sections.rewards.pendingSelections).toHaveLength(0)

    const closed = closePromotionCatalogState(toggled)
    expect(closed.openSection).toBeNull()
    expect(closed.sections.qualifiers.pendingSelections).toHaveLength(0)
    expect(closed.sections.rewards.pendingSelections).toHaveLength(0)
    expect(closed.sections.qualifiers.rows).toHaveLength(1)
  })

  it('keeps previous rows when a search fails so loading does not wipe visible results', () => {
    const initial = createPromotionCatalogState()
    const firstLoad = beginPromotionCatalogSearch(initial, 'qualifiers')
    const withRows = resolvePromotionCatalogSearchSuccess(
      firstLoad,
      'qualifiers',
      [
        {
          id: 'prod_1',
          title: 'Yo Momma',
          handle: 'yo-momma',
          status: 'ACTIVE',
          fulfillmentType: 'PHYSICAL',
          variants: [{ id: 'var_1', title: 'Default', sku: 'dwsd' }],
        },
      ],
      firstLoad.sections.qualifiers.requestId,
      ''
    )
    const nextLoad = beginPromotionCatalogSearch(withRows, 'qualifiers')
    const failed = resolvePromotionCatalogSearchError(
      nextLoad,
      'qualifiers',
      'Failed to search product catalog.',
      nextLoad.sections.qualifiers.requestId
    )

    expect(failed.sections.qualifiers.rows).toHaveLength(1)
    expect(failed.sections.qualifiers.loading).toBe(false)
    expect(failed.sections.qualifiers.error).toBe('Failed to search product catalog.')
  })
})
