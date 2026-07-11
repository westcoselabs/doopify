"use client";

import { Suspense } from 'react';
import DraftOrdersWorkspace from '@/components/draft-orders/DraftOrdersWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function DraftOrdersPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRouteProviders customers discounts products>
        <DraftOrdersWorkspace />
      </DashboardRouteProviders>
    </Suspense>
  );
}
