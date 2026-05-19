"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CustomersContext = createContext(null);

// ── Transform API customer → UI shape ─────────────────────────────────────────
function transformCustomer(customer) {
  const defaultAddr =
    customer.addresses?.find(a => a.isDefault) || customer.addresses?.[0];
  const addrString = defaultAddr
    ? [defaultAddr.address1, defaultAddr.city, defaultAddr.province]
        .filter(Boolean)
        .join(', ')
    : '';

  const name =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
    customer.email;

  return {
    id: customer.id,
    name,
    email: customer.email,
    phone: customer.phone || '',
    tags: customer.tags || [],
    totalSpent: customer.totalSpent || 0,
    orderCount: customer.orderCount || 0,
    lastOrderDate: customer.updatedAt || customer.createdAt,
    defaultAddress: addrString,
    notes: customer.note || '',
    recentOrders: [],
    addresses: customer.addresses || [],
    acceptsMarketing: customer.acceptsMarketing || false,
  };
}

export function CustomersProvider({ children }) {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customers?pageSize=25');
      const json = await res.json();
      if (json.success) {
        setCustomers((json.data.customers || []).map(transformCustomer));
      } else {
        setError(json.error || 'Failed to load customers');
      }
    } catch (e) {
      setError('Failed to load customers');
      console.error('[CustomersContext]', e);
    } finally {
      setLoading(false);
    }
  }, []);

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const updateCustomer = useCallback((customerId, updater) => {
    setCustomers(current =>
      current.map(c => (c.id === customerId ? updater(c) : c))
    );
  }, []);

  const createCustomer = useCallback(async (input) => {
    const normalizedEmail = String(input?.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Email is required');
    }

    const existing = customers.find(
      (customer) => String(customer.email || '').trim().toLowerCase() === normalizedEmail
    );
    if (existing) {
      return { customer: existing, created: false, duplicate: true };
    }

    const response = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        firstName: String(input?.firstName || '').trim() || undefined,
        lastName: String(input?.lastName || '').trim() || undefined,
        phone: String(input?.phone || '').trim() || undefined,
        note: String(input?.note || '').trim() || undefined,
        shippingAddress:
          String(input?.shippingAddress || '').trim() || undefined,
        billingAddress:
          String(input?.billingAddress || '').trim() || undefined,
      }),
    });

    const json = await response.json();
    if (!json?.success) {
      throw new Error(json?.error || 'Failed to create customer');
    }

    const created = transformCustomer(json.data);
    setCustomers((current) => [created, ...current]);
    return { customer: created, created: true, duplicate: false };
  }, [customers]);

  const value = useMemo(
    () => ({
      customers,
      setCustomers,
      updateCustomer,
      createCustomer,
      loading,
      error,
      refetch: fetchCustomers,
    }),
    [customers, loading, error, updateCustomer, createCustomer, fetchCustomers]
  );

  return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
}

export function useCustomers() {
  const context = useContext(CustomersContext);
  if (!context) throw new Error('useCustomers must be used within CustomersProvider');
  return context;
}
