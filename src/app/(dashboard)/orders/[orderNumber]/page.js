import { notFound } from 'next/navigation';
import OrderDetailClientPage from '@/components/orders/OrderDetailClientPage';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export default async function OrderDetailPage({ params }) {
  const resolvedParams = await params;
  const orderNumber = resolvedParams?.orderNumber;

  if (!orderNumber) {
    notFound();
  }

  return (
    <DashboardRouteProviders orders>
      <OrderDetailClientPage orderNumber={orderNumber} />
    </DashboardRouteProviders>
  );
}
