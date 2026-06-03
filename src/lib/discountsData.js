export const DISCOUNT_TYPES = ['discount code', 'automatic'];
export const DISCOUNT_METHODS = ['amount off products', 'amount off order', 'free shipping'];
export const DISCOUNT_STATUSES = ['active', 'scheduled', 'expired'];

export function createSeedDiscounts() {
  return [
    {
      id: 'dis_001',
      title: 'WELCOME10',
      type: 'discount code',
      method: 'amount off order',
      status: 'active',
      combinesWith: ['product discounts'],
      startsAt: '2026-04-01T00:00:00Z',
      endsAt: '2026-05-01T00:00:00Z',
      usageCount: 124,
      summary: '10% off first order over $50',
      customerEligibility: 'New customers',
      salesChannel: 'All channels',
    },
    {
      id: 'dis_002',
      title: 'SPRINGSHIP',
      type: 'discount code',
      method: 'free shipping',
      status: 'active',
      combinesWith: ['order discounts'],
      startsAt: '2026-04-01T00:00:00Z',
      endsAt: '2026-04-30T00:00:00Z',
      usageCount: 58,
      summary: 'Free standard shipping on spring campaign orders',
      customerEligibility: 'Everyone',
      salesChannel: 'Online Store',
    },
    {
      id: 'dis_003',
      title: 'Buy 2 Accessories, get 1 free',
      type: 'automatic',
      method: 'buy x get y',
      status: 'active',
      combinesWith: [],
      startsAt: '2026-04-05T00:00:00Z',
      endsAt: '2026-04-20T00:00:00Z',
      usageCount: 19,
      summary: 'Auto-applies to matching accessory collections',
      customerEligibility: 'Everyone',
      salesChannel: 'Online Store',
    },
    {
      id: 'dis_004',
      title: 'VIP50',
      type: 'discount code',
      method: 'amount off products',
      status: 'scheduled',
      combinesWith: ['shipping discounts'],
      startsAt: '2026-04-15T00:00:00Z',
      endsAt: '2026-05-15T00:00:00Z',
      usageCount: 0,
      summary: '$50 off premium audio collection',
      customerEligibility: 'Specific customer segment',
      salesChannel: 'All channels',
    },
  ];
}
