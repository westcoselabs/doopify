"use client";

import SettingsWorkspace from '@/components/settings/SettingsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function SettingsPage() {
  return (
    <DashboardRouteProviders>
      <SettingsWorkspace />
    </DashboardRouteProviders>
  );
}
