"use client";

import DiscountsWorkspace from '@/components/discounts/DiscountsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function DiscountsPage() {
  return (
    <DashboardRouteProviders discounts>
      <DiscountsWorkspace />
    </DashboardRouteProviders>
  );
}
