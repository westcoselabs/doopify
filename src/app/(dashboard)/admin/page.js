import AdminDashboardWorkspace from '@/components/admin/AdminDashboardWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export const metadata = {
  title: 'Doopify | Admin Dashboard',
  description: 'Operational overview for the Doopify admin workspace.',
};

export default function AdminDashboardPage() {
  return (
    <DashboardRouteProviders customers orders products>
      <AdminDashboardWorkspace />
    </DashboardRouteProviders>
  );
}
