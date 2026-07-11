"use client";

import AnalyticsWorkspace from '@/components/analytics/AnalyticsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function AnalyticsPage() {
  return (
    <DashboardRouteProviders customers discounts orders products>
      <AnalyticsWorkspace />
    </DashboardRouteProviders>
  );
}
