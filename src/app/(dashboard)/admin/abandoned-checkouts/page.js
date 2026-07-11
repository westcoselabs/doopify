import AbandonedCheckoutsWorkspace from '@/components/abandoned-checkouts/AbandonedCheckoutsWorkspace';
import DashboardRouteProviders from '@/components/dashboard/DashboardRouteProviders';

export const metadata = {
  title: 'Doopify | Abandoned Checkouts',
  description: 'Review and recover abandoned checkout sessions.',
};

export default function AdminAbandonedCheckoutsPage() {
  return (
    <DashboardRouteProviders>
      <AbandonedCheckoutsWorkspace />
    </DashboardRouteProviders>
  );
}
