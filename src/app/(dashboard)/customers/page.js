"use client";

import CustomersWorkspace from '@/components/customers/CustomersWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default function CustomersPage() {
  return (
    <DashboardRouteProviders customers>
      <CustomersWorkspace />
    </DashboardRouteProviders>
  );
}
