"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ProductsContext = createContext(null);

// ── Transform API product → lightweight UI shape (used by Analytics) ──────────
function transformProduct(product) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: (product.status || 'DRAFT').toLowerCase(),
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags || [],
    variants: (product.variants || []).map(v => ({
      id: v.id,
      title: v.title,
      sku: v.sku || '',
      price: v.price,
      compareAtPrice: v.compareAtPrice || null,
      inventoryQty: v.inventory ?? 0,
    })),
    images: (product.media || []).map(m => ({
      id: m.id,
      url: m.asset?.url || '',
      altText: m.asset?.altText || '',
      isFeatured: m.isFeatured,
    })),
  };
}

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?pageSize=25');
      const json = await res.json();
      if (json.success) {
        setProducts((json.data.products || []).map(transformProduct));
      } else {
        setError(json.error || 'Failed to load products');
      }
    } catch (e) {
      setError('Failed to load products');
      console.error('[ProductsContext]', e);
    } finally {
      setLoading(false);
    }
  }, []);

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const updateProduct = useCallback((productId, updater) => {
    setProducts(current =>
      current.map(p => (p.id === productId ? updater(p) : p))
    );
  }, []);

  const value = useMemo(
    () => ({ products, setProducts, updateProduct, loading, error, refetch: fetchProducts }),
    [products, loading, error, updateProduct, fetchProducts]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const context = useContext(ProductsContext);
  if (!context) throw new Error('useProducts must be used within ProductsProvider');
  return context;
}
