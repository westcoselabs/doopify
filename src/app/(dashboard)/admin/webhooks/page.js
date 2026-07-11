import WebhookDeliveriesWorkspace from '@/components/webhooks/WebhookDeliveriesWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export const metadata = {
  title: 'Doopify | Delivery logs',
  description: 'Delivery log observability for inbound provider webhooks, outbound webhooks, and transactional email deliveries.',
};

export default function AdminWebhooksPage() {
  return (
    <DashboardRouteProviders>
      <WebhookDeliveriesWorkspace />
    </DashboardRouteProviders>
  );
}
