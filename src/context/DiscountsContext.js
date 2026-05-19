"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DiscountsContext = createContext(null);

const TYPE_MAP = {
  CODE: 'discount code',
  AUTOMATIC: 'automatic',
};
const METHOD_MAP = {
  PERCENTAGE: 'amount off products',
  FIXED_AMOUNT: 'amount off order',
  FREE_SHIPPING: 'free shipping',
  BUY_X_GET_Y: 'buy x get y',
};
const STATUS_MAP = {
  ACTIVE: 'active',
  SCHEDULED: 'scheduled',
  EXPIRED: 'expired',
  DISABLED: 'expired',
};

// ── Transform API discount → UI shape ─────────────────────────────────────────
function transformDiscount(discount) {
  const combinesWith = [
    discount.combinesWithOrders && 'order discounts',
    discount.combinesWithProducts && 'product discounts',
    discount.combinesWithShipping && 'shipping discounts',
  ].filter(Boolean);

  const method = METHOD_MAP[discount.method] || discount.method?.toLowerCase() || '';
  const isPercent = discount.method === 'PERCENTAGE';
  const summary = discount.value
    ? `${isPercent ? discount.value + '%' : '$' + discount.value} off`
    : '';

  return {
    id: discount.id,
    title: discount.title,
    code: discount.code || '',
    type: TYPE_MAP[discount.type] || discount.type?.toLowerCase() || '',
    method,
    status: STATUS_MAP[discount.status] || discount.status?.toLowerCase() || 'active',
    combinesWith,
    startsAt: discount.startsAt || '',
    endsAt: discount.endsAt || '',
    usageCount: discount.usageCount || 0,
    usageLimit: discount.usageLimit || '',
    minimumOrder: discount.minimumOrder || '',
    value: discount.value || 0,
    summary,
    customerEligibility: 'Everyone',
    salesChannel: 'All channels',
  };
}

export function DiscountsProvider({ children }) {
  const [discounts, setDiscounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDiscounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/discounts?pageSize=25');
      const json = await res.json();
      if (json.success) {
        setDiscounts((json.data.discounts || []).map(transformDiscount));
      } else {
        setError(json.error || 'Failed to load discounts');
      }
    } catch (e) {
      setError('Failed to load discounts');
      console.error('[DiscountsContext]', e);
    } finally {
      setLoading(false);
    }
  }, []);

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
  useEffect(() => { fetchDiscounts(); }, [fetchDiscounts]);

  const addDiscount = useCallback(discount => {
    setDiscounts(current => [discount, ...current]);
  }, []);

  const updateDiscount = useCallback((discountId, updater) => {
    setDiscounts(current =>
      current.map(d => (d.id === discountId ? updater(d) : d))
    );
  }, []);

  const value = useMemo(
    () => ({ discounts, setDiscounts, addDiscount, updateDiscount, loading, error, refetch: fetchDiscounts }),
    [discounts, loading, error, addDiscount, updateDiscount, fetchDiscounts]
  );

  return <DiscountsContext.Provider value={value}>{children}</DiscountsContext.Provider>;
}

export function useDiscounts() {
  const context = useContext(DiscountsContext);
  if (!context) throw new Error('useDiscounts must be used within DiscountsProvider');
  return context;
}
