"use client";

import ProductsWorkspace from '@/components/products/ProductsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';
import { ProductProvider } from '@/context/ProductContext';

export default function ProductsPage() {
  return (
    <DashboardRouteProviders>
      <ProductProvider>
        <ProductsWorkspace />
      </ProductProvider>
    </DashboardRouteProviders>
  );
}
