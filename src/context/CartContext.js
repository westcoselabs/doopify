"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const CART_KEY = 'doopify_cart';

function loadCart() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CART_KEY) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {}
}

function normalizeFulfillmentType(value) {
  return String(value || '').trim().toUpperCase() === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL';
}

function normalizeCartItem(item) {
  return {
    ...item,
    fulfillmentType: normalizeFulfillmentType(item?.fulfillmentType),
  };
}

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
  useEffect(() => { setItems(loadCart().map(normalizeCartItem)); }, []);

  const updateItems = useCallback(next => {
    setItems(next);
    saveCart(next);
  }, []);

  const addItem = useCallback(item => {
    setItems(current => {
      const normalizedItem = normalizeCartItem(item);
      const existing = current.find(i => i.variantId === normalizedItem.variantId);
      const next = existing
        ? current.map(i => i.variantId === normalizedItem.variantId ? { ...i, quantity: i.quantity + (normalizedItem.quantity || 1) } : i)
        : [...current, { ...normalizedItem, quantity: normalizedItem.quantity || 1 }];
      saveCart(next);
      return next;
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback(variantId => {
    setItems(current => {
      const next = current.filter(i => i.variantId !== variantId);
      saveCart(next);
      return next;
    });
  }, []);

  const updateQuantity = useCallback((variantId, quantity) => {
    if (quantity < 1) { removeItem(variantId); return; }
    setItems(current => {
      const next = current.map(i => i.variantId === variantId ? { ...i, quantity } : i);
      saveCart(next);
      return next;
    });
  }, [removeItem]);

  const clearCart = useCallback(() => { updateItems([]); }, [updateItems]);
  const replaceItems = useCallback((nextItems) => {
    const normalized = Array.isArray(nextItems)
      ? nextItems
          .filter(item => item && item.variantId && Number(item.quantity) > 0)
          .map(item => normalizeCartItem({ ...item, quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)) }))
      : [];
    updateItems(normalized);
  }, [updateItems]);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const total = useMemo(() => items.reduce((sum, i) => sum + i.price * i.quantity, 0), [items]);
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  const value = useMemo(() => ({
    items, addItem, removeItem, updateQuantity, clearCart, replaceItems,
    total, count, isOpen, setIsOpen, openCart, closeCart,
  }), [items, addItem, removeItem, updateQuantity, clearCart, replaceItems, total, count, isOpen, openCart, closeCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
