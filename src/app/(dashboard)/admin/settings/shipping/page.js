"use client";

import ShippingSettingsWorkspace from '@/components/settings/ShippingSettingsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function AdminShippingSettingsPage() {
  return (
    <DashboardRouteProviders>
      <ShippingSettingsWorkspace />
    </DashboardRouteProviders>
  );
}
