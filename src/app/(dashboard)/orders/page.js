"use client";

import OrdersWorkspace from '@/components/orders/OrdersWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function OrdersPage() {
  return (
    <DashboardRouteProviders orders>
      <OrdersWorkspace />
    </DashboardRouteProviders>
  );
}
