"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { transformOrder } from './orders-transform';

const OrdersContext = createContext(null);

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/orders?pageSize=25');
      const json = await res.json();
      if (json.success) {
        setOrders((json.data.orders || []).map(transformOrder));
      } else {
        setError(json.error || 'Failed to load orders');
      }
    } catch (e) {
      setError('Failed to load orders');
      console.error('[OrdersContext]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    fetchOrders();
  }, [fetchOrders]);

  const addOrder = useCallback((order) => {
    setOrders((current) => [order, ...current]);
  }, []);

  const updateOrder = useCallback((orderId, updater) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  }, []);

  const value = useMemo(
    () => ({ orders, setOrders, addOrder, updateOrder, loading, error, refetch: fetchOrders }),
    [orders, loading, error, addOrder, updateOrder, fetchOrders]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (!context) throw new Error('useOrders must be used within OrdersProvider');
  return context;
}
